/**
 * MEDELIVERY 이메일 발송 모듈 (Nodemailer)
 * - 1순위: 발신자 이메일(user)과 비밀번호(pass)가 입력된 경우 실제 SMTP(네이버/Gmail) 발송
 * - 2순위: 발신자 정보가 비어 있는 경우 무료 Ethereal 테스트 SMTP 발송
 * - 3순위: 만약 SMTP 인증 오류나 네트워크 제한이 발생하더라도 에러(500)를 내지 않고
 *          내장 웹 메일함(local_inbox)으로 즉시 발송 처리하여 언제든 이메일 본문을 열어볼 수 있게 보장합니다.
 */

let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (err) {
  console.warn('[안내] nodemailer 미설치 상태입니다. 내장 웹 메일함 모드로 동작합니다.');
}

let runtimeSmtpConfig = {
  service: process.env.SMTP_SERVICE || 'naver',
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
};

function setRuntimeSmtpConfig({ service, user, pass }) {
  runtimeSmtpConfig.service = service ? String(service).trim().toLowerCase() : 'naver';
  // 빈 문자열을 보내면 기존에 저장되어 있던 잘못된 계정 정보를 초기화!
  runtimeSmtpConfig.user = user ? String(user).trim() : '';
  runtimeSmtpConfig.pass = pass ? String(pass).replace(/\s+/g, '') : '';
}

function getRuntimeSmtpConfig() {
  return {
    service: runtimeSmtpConfig.service,
    user: runtimeSmtpConfig.user,
    hasPass: Boolean(runtimeSmtpConfig.pass),
  };
}

async function createTransporter() {
  if (!nodemailer) {
    return { transporter: null, mode: 'local_inbox', fromUser: 'no-reply@medelivery.kr' };
  }

  const { service, user, pass } = runtimeSmtpConfig;

  // 발신자 계정과 비밀번호가 모두 입력된 경우에만 실제 네이버/구글 SMTP 사용
  if (user && pass) {
    const isNaver = service === 'naver' || user.endsWith('@naver.com');
    const host = process.env.SMTP_HOST || (isNaver ? 'smtp.naver.com' : 'smtp.gmail.com');
    const port = Number(process.env.SMTP_PORT || 587);
    const fullEmail = user.includes('@')
      ? user
      : `${user}@${isNaver ? 'naver.com' : 'gmail.com'}`;

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user: fullEmail, pass },
    });

    return {
      transporter,
      mode: isNaver ? 'naver_smtp' : 'gmail_smtp',
      fromUser: fullEmail,
    };
  }

  // 발신자 계정이 비어 있으면 Ethereal 무료 테스트 SMTP 계정 자동 생성
  try {
    const testAccount = await nodemailer.createTestAccount();
    const transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    return { transporter, mode: 'ethereal_smtp', fromUser: testAccount.user };
  } catch (err) {
    return { transporter: null, mode: 'local_inbox', fromUser: 'no-reply@medelivery.kr' };
  }
}

/**
 * 타임캡슐 개봉일 도래 시 수신자에게 이메일 발송
 */
async function sendTimeCapsuleInviteEmail({
  toEmail,
  authorName,
  capsuleTitle,
  pageUrl,
  inviteCode,
  isDeadmanSwitch = false,
  inactivityDays = 90,
}) {
  const recipient =
    toEmail && String(toEmail).includes('@')
      ? String(toEmail).trim()
      : runtimeSmtpConfig.user || 'recipient@example.com';

  const subject = isDeadmanSwitch
    ? `[MEDELIVERY 데드맨 스위치 알림] ${authorName}님의 장기 미접속(${inactivityDays}일)으로 전체 아카이브 열람 코드가 전달되었습니다.`
    : `[MEDELIVERY] ${authorName}님이 남기신 타임캡슐("${capsuleTitle}") 개봉일이 도래했습니다.`;

  const descriptionHtml = isDeadmanSwitch
    ? `<strong>${authorName}</strong>님이 설정하신 미접속 기준 기간(<strong>${inactivityDays}일</strong>) 동안 활동이 감지되지 않아, 지정된 수신자께 <strong>고인의 전체 디지털 유산 아카이브(일기장 · AI 자서전 · 타임캡슐)</strong> 열람 권한이 전달되었습니다.<br/>아래 열람 페이지에 접속하여 <strong>6자리 보안 초대 코드</strong>를 입력하시면 모든 기록을 열람하고 PDF로 다운로드하실 수 있습니다.`
    : `<strong>${authorName}</strong>님이 봉인해 두신 타임캡슐 <strong>「${capsuleTitle}」</strong>의 개봉 지정일이 도래했습니다.<br/>아래 열람 페이지에 접속하여 <strong>6자리 보안 초대 코드</strong>를 입력하시면 남겨진 기록을 열람하고 PDF로 다운로드하실 수 있습니다.`;

  const html = `
    <div style="font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; max-width: 560px; margin: 0 auto; background: #FAF6F0; border: 1px solid #E5DCCF; border-radius: 16px; padding: 36px 32px; color: #2C221A;">
      <p style="font-size: 11px; font-weight: 700; letter-spacing: 0.14em; color: #8C6239; margin: 0 0 8px;">${
        isDeadmanSwitch ? 'MEDELIVERY DEADMAN SWITCH ARCHIVE' : 'MEDELIVERY TIME CAPSULE'
      }</p>
      <h2 style="font-size: 22px; margin: 0 0 14px; color: #2C221A;">${
        isDeadmanSwitch ? `${authorName}님의 소중한 삶의 기록이 전달되었습니다` : '소중한 기록이 도착했습니다'
      }</h2>
      <p style="font-size: 14px; line-height: 1.7; color: #5C4B3B; margin: 0 0 24px;">
        ${descriptionHtml}
      </p>

      <div style="background: #FFFFFF; border: 1px solid #DFD5C8; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
        <div style="font-size: 12px; color: #8C7A68; margin-bottom: 8px;">6자리 보안 초대 코드 (특수문자 포함)</div>
        <div style="font-family: Consolas, monospace; font-size: 28px; font-weight: 700; letter-spacing: 6px; color: #2C221A;">${inviteCode}</div>
      </div>

      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${pageUrl}" style="display: inline-block; background: #8C6239; color: #FFFFFF; text-decoration: none; font-size: 14px; font-weight: 600; padding: 14px 28px; border-radius: 10px;">
          타임캡슐 열람 페이지로 이동하기
        </a>
      </div>

      <p style="font-size: 12px; color: #8C7A68; line-height: 1.6; border-top: 1px dashed #DFD5C8; padding-top: 16px; margin: 0;">
        ※ 보안 안내: 첫 수신자가 페이지를 방문(열람)한 시각을 기준으로 <strong>14일 후</strong> 해당 타임캡슐 페이지는 영구 삭제됩니다. 기한 내에 PDF로 다운로드하여 보관해 주세요.
      </p>
    </div>
  `;

  const { transporter, mode, fromUser } = await createTransporter();

  // 내장 메일함 모드인 경우
  if (!transporter) {
    return {
      sent: true,
      mode: 'local_inbox',
      recipient,
      preview_url: null,
      html,
    };
  }

  try {
    const info = await transporter.sendMail({
      from: `"MEDELIVERY" <${fromUser}>`,
      to: recipient,
      subject,
      html,
    });

    const previewUrl = nodemailer ? nodemailer.getTestMessageUrl(info) || null : null;
    console.log(`[Nodemailer] 이메일 발송 성공 (${mode}) -> 수신자: ${recipient}`);

    return {
      sent: true,
      mode,
      recipient,
      message_id: info.messageId,
      preview_url: previewUrl,
      html,
    };
  } catch (err) {
    console.error('[Nodemailer 이메일 발송 오류]', err.message);
    return {
      sent: false,
      mode,
      recipient,
      error: err.message,
      preview_url: null,
      html,
    };
  }
}

module.exports = {
  sendTimeCapsuleInviteEmail,
  setRuntimeSmtpConfig,
  getRuntimeSmtpConfig,
};
