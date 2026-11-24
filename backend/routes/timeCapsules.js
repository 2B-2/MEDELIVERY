const express = require('express');
const { store, seq, generateSixCharInviteCode } = require('../db/store');
const { HttpError, asyncHandler, authenticate } = require('../middleware/auth');
const {
  sendTimeCapsuleInviteEmail,
  setRuntimeSmtpConfig,
  getRuntimeSmtpConfig,
} = require('../utils/mailer');

const router = express.Router();

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * 1) 개봉일(open_date) 도래 시 6자리 특수문자 포함 보안 초대 코드 발급 및 이메일 발송 처리
 * 2) 첫 수신자 방문 시각(first_visited_at) 기준 14일 경과 시 타임캡슐 자동 삭제 처리
 */
async function processTimeCapsuleLifecycle(baseUrl = 'http://localhost:4000') {
  const now = new Date();
  const dispatchedList = [];
  const expiredCapsuleIds = [];

  // A. 첫 방문 후 14일이 지난 타임캡슐 자동 삭제 검사
  for (let i = store.time_capsules.length - 1; i >= 0; i--) {
    const cap = store.time_capsules[i];
    if (cap.first_visited_at) {
      const firstVisitTime = new Date(cap.first_visited_at).getTime();
      if (now.getTime() - firstVisitTime >= FOURTEEN_DAYS_MS) {
        expiredCapsuleIds.push(cap.capsule_id);
        store.time_capsules.splice(i, 1);
      }
    }
  }

  // B. 개봉일(open_date)이 도래한 타임캡슐에 대해 6자리 초대 코드 생성 및 이메일 발송
  for (const cap of store.time_capsules) {
    const openDate = new Date(cap.open_date);
    if (now >= openDate && !cap.access_code) {
      const owner = store.users.find((u) => u.user_id === cap.user_id);
      const inviteCode = generateSixCharInviteCode();
      const generatedAt = now.toISOString();

      cap.access_code = inviteCode;
      cap.code_generated_at = generatedAt;

      if (owner) {
        owner.access_code = inviteCode;
        owner.code_generated_at = generatedAt;
      }

      const pageUrl = `${baseUrl}/capsule-view?id=${cap.capsule_id}`;
      const recipientContact =
        cap.recipient_email || (owner ? owner.emergency_contact : 'recipient@example.com');
      const authorName = owner ? owner.username : '작성자';

      // Nodemailer 이메일 발송 호출 (.env 계정 없이도 동작)
      const mailResult = await sendTimeCapsuleInviteEmail({
        toEmail: recipientContact,
        authorName,
        capsuleTitle: cap.title,
        pageUrl,
        inviteCode,
      });

      const notificationId = seq.notification_id++;
      // Ethereal 외부 URL이 있으면 사용하고, 없으면 내장 웹 메일함 미리보기(/email-preview/:id) URL 제공
      const previewUrl =
        mailResult.preview_url || `${baseUrl}/email-preview/${notificationId}`;

      const notification = {
        notification_id: notificationId,
        capsule_id: cap.capsule_id,
        user_id: cap.user_id,
        recipient_contact: recipientContact,
        author_name: authorName,
        capsule_title: cap.title,
        page_url: pageUrl,
        access_code: inviteCode,
        sent_at: generatedAt,
        email_sent: mailResult.sent,
        email_mode: mailResult.mode,
        email_error: mailResult.error || null,
        email_preview_url: previewUrl,
        email_html: mailResult.html,
      };

      store.notifications.unshift(notification);
      dispatchedList.push(notification);
    }
  }

  return { dispatchedList, expiredCapsuleIds };
}

/**
 * [수신자 전용 - 비로그인] 1. 6자리 보안 초대 코드로 타임캡슐 열람 (POST /api/time-capsules/unlock)
 */
router.post(
  '/unlock',
  asyncHandler(async (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    await processTimeCapsuleLifecycle(baseUrl);

    const { access_code, capsule_id } = req.body || {};

    if (!access_code || String(access_code).length !== 6) {
      throw new HttpError(400, '특수문자를 포함한 6자리 보안 초대 코드를 정확히 입력해 주세요.');
    }

    const inputCode = String(access_code).trim();

    // URL의 capsule_id와 상관없이 6자리 코드가 일치하는 타임캡슐을 먼저 찾습니다.
    const capsuleIndex = store.time_capsules.findIndex(
      (c) => c.access_code === inputCode
    );

    if (capsuleIndex === -1) {
      // 데드맨 스위치(users.access_code)로 발급된 유족 통합 아카이브 코드인지 함께 확인
      const deadmanUser = store.users.find((u) => u.access_code === inputCode);
      if (deadmanUser) {
        const now = new Date();
        if (!deadmanUser.archive_first_visited_at) {
          deadmanUser.archive_first_visited_at = now.toISOString();
          deadmanUser.archive_expires_at = new Date(
            now.getTime() + FOURTEEN_DAYS_MS
          ).toISOString();
        }
        deadmanUser.is_code_verified = true;
        deadmanUser.is_transferred = true;

        const diaries = store.diaries.filter((d) => d.user_id === deadmanUser.user_id);
        const interviews = store.interviews
          .filter((i) => i.user_id === deadmanUser.user_id)
          .map((i) => ({
            ...i,
            questions: store.interviewQs.filter(
              (q) => q.interview_id === i.interview_id
            ),
          }));
        const capsules = store.time_capsules.filter(
          (c) => c.user_id === deadmanUser.user_id
        );

        const combinedBody = [
          `[1. 고인의 일기장 (${diaries.length}편)]`,
          diaries.length
            ? diaries
                .map(
                  (d) =>
                    `• (${new Date(d.created_at).toLocaleDateString('ko-KR')}) ${d.title}\n  ${d.content}`
                )
                .join('\n\n')
            : '작성된 일기가 없습니다.',
          `\n----------------------------------------\n[2. AI 자서전 인터뷰 (${interviews.length}개 단원)]`,
          interviews.length
            ? interviews
                .map(
                  (i) =>
                    `■ 단원: ${i.chapter_name}\n` +
                    (i.questions.length
                      ? i.questions.map((q) => q.question_answer).join('\n\n')
                      : '저장된 문답이 없습니다.')
                )
                .join('\n\n')
            : '작성된 자서전이 없습니다.',
          `\n----------------------------------------\n[3. 봉인된 타임캡슐 (${capsules.length}개)]`,
          capsules.length
            ? capsules.map((c) => `• [${c.title}]\n  ${c.message}`).join('\n\n')
            : '작성된 타임캡슐이 없습니다.',
        ].join('\n\n');

        const remainingMs =
          new Date(deadmanUser.archive_expires_at).getTime() - now.getTime();
        const remainingDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));

        return res.status(200).json({
          success: true,
          mode: 'DEADMAN_ARCHIVE',
          message: '데드맨 스위치 유족 인증이 완료되어 전체 아카이브가 개봉되었습니다.',
          data: {
            author_name: deadmanUser.username,
            title: `${deadmanUser.username}님의 디지털 유산 통합 아카이브 (일기 · 자서전 · 타임캡슐)`,
            message: combinedBody,
            open_date: deadmanUser.code_generated_at || now.toISOString(),
            is_opened: true,
            first_visited_at: deadmanUser.archive_first_visited_at,
            expires_at: deadmanUser.archive_expires_at,
            remaining_days: remainingDays,
          },
        });
      }

      throw new HttpError(
        401,
        '보안 초대 코드가 일치하지 않거나, 열람 기한(첫 방문 후 14일)이 지나 이미 자동 삭제된 페이지입니다.'
      );
    }

    const capsule = store.time_capsules[capsuleIndex];
    const owner = store.users.find((u) => u.user_id === capsule.user_id);
    const now = new Date();

    if (capsule.first_visited_at) {
      const elapsedMs = now.getTime() - new Date(capsule.first_visited_at).getTime();
      if (elapsedMs >= FOURTEEN_DAYS_MS) {
        store.time_capsules.splice(capsuleIndex, 1);
        throw new HttpError(
          410,
          '첫 수신자 방문 후 14일이 경과하여 타임캡슐 페이지가 영구 삭제되었습니다.'
        );
      }
    } else {
      // 첫 수신자 방문 시각 기록 (14일 카운트다운 시작)
      capsule.first_visited_at = now.toISOString();
      capsule.expires_at = new Date(now.getTime() + FOURTEEN_DAYS_MS).toISOString();
    }

    capsule.is_opened = true;
    if (owner) {
      owner.is_code_verified = true;
      owner.is_transferred = true;
    }

    const remainingMs = new Date(capsule.expires_at).getTime() - now.getTime();
    const remainingDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));

    res.status(200).json({
      success: true,
      message: '보안 초대 코드 인증이 완료되었습니다.',
      data: {
        capsule_id: capsule.capsule_id,
        user_id: capsule.user_id,
        author_name: owner ? owner.username : '작성자',
        title: capsule.title,
        message: capsule.message,
        open_date: capsule.open_date,
        is_opened: capsule.is_opened,
        first_visited_at: capsule.first_visited_at,
        expires_at: capsule.expires_at,
        remaining_days: remainingDays,
      },
    });
  })
);

/**
 * [테스트/관리용] 2. 개봉일 도래 감지 및 이메일 발송 트리거
 */
router.post(
  '/dispatch-codes',
  asyncHandler(async (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const { force_capsule_id, simulate_expired_capsule_id } = req.body || {};

    if (force_capsule_id) {
      const target = store.time_capsules.find((c) => c.capsule_id === Number(force_capsule_id));
      if (target) {
        target.open_date = new Date(Date.now() - 1000).toISOString();
      }
    }

    if (simulate_expired_capsule_id) {
      const target = store.time_capsules.find(
        (c) => c.capsule_id === Number(simulate_expired_capsule_id)
      );
      if (target) {
        target.first_visited_at = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
      }
    }

    const { dispatchedList, expiredCapsuleIds } = await processTimeCapsuleLifecycle(baseUrl);

    res.status(200).json({
      success: true,
      message: `개봉일 감지 완료 (신규 이메일 발송: ${dispatchedList.length}건, 14일 경과 자동 삭제: ${expiredCapsuleIds.length}건)`,
      dispatched: dispatchedList.map(({ email_html, ...rest }) => rest),
      expired_capsule_ids: expiredCapsuleIds,
      all_notifications: store.notifications.map(({ email_html, ...rest }) => rest),
    });
  })
);

router.get('/notifications', (req, res) => {
  res.status(200).json({
    success: true,
    data: store.notifications.map(({ email_html, ...rest }) => rest),
  });
});

/**
 * [실제 이메일 발송 설정 및 즉시 테스트 발송 API]
 * - POST /api/time-capsules/smtp-config : 발신용 Gmail/네이버 계정 등록
 * - POST /api/time-capsules/send-test-email : 지정한 수신 이메일로 실제 이메일 즉시 발송 테스트
 */
router.post(
  '/smtp-config',
  asyncHandler(async (req, res) => {
    const { service, user, pass } = req.body || {};
    if (!user || !pass) {
      throw new HttpError(400, '발신용 이메일 주소(user)와 앱 비밀번호(pass)를 모두 입력해 주세요.');
    }
    setRuntimeSmtpConfig({ service, user, pass });
    res.status(200).json({
      success: true,
      message: `발신 이메일 계정(${user}) 설정이 적용되었습니다. 이제 실제 이메일이 발송됩니다!`,
      config: getRuntimeSmtpConfig(),
    });
  })
);

router.post(
  '/send-test-email',
  asyncHandler(async (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const { to_email, smtp_service, smtp_user, smtp_pass } = req.body || {};

    // 입력칸이 비어 있으면 이전 잘못된 SMTP 설정도 함께 초기화!
    setRuntimeSmtpConfig({
      service: smtp_service,
      user: smtp_user || '',
      pass: smtp_pass || '',
    });

    if (!to_email || !String(to_email).includes('@')) {
      throw new HttpError(400, '이메일을 받을 실제 수신자 이메일 주소(to_email)를 입력해 주세요.');
    }

    // 최신 타임캡슐이 있으면 그 캡슐의 코드를 보내고, 없으면 샘플 타임캡슐을 자동 생성해 발송
    let targetCapsule = store.time_capsules[store.time_capsules.length - 1];
    if (!targetCapsule) {
      const inviteCode = generateSixCharInviteCode();
      targetCapsule = {
        capsule_id: seq.capsule_id++,
        user_id: 1,
        title: '사랑하는 가족들에게 남기는 타임캡슐',
        message: '항상 건강하고 행복하길 바란다. 이 타임캡슐은 첫 방문 후 14일간 열람 가능하며 PDF로 다운로드할 수 있습니다.',
        open_date: new Date().toISOString(),
        is_opened: false,
        recipient_email: String(to_email).trim(),
        access_code: inviteCode,
        code_generated_at: new Date().toISOString(),
        first_visited_at: null,
        expires_at: null,
      };
      store.time_capsules.push(targetCapsule);
    } else if (!targetCapsule.access_code) {
      targetCapsule.access_code = generateSixCharInviteCode();
      targetCapsule.code_generated_at = new Date().toISOString();
    }

    const pageUrl = `${baseUrl}/capsule-view?id=${targetCapsule.capsule_id}`;
    const mailResult = await sendTimeCapsuleInviteEmail({
      toEmail: to_email,
      authorName: '홍길동',
      capsuleTitle: targetCapsule.title,
      pageUrl,
      inviteCode: targetCapsule.access_code,
    });

    const notificationId = seq.notification_id++;
    const previewUrl =
      mailResult.preview_url || `${baseUrl}/email-preview/${notificationId}`;

    const notification = {
      notification_id: notificationId,
      capsule_id: targetCapsule.capsule_id,
      user_id: targetCapsule.user_id,
      recipient_contact: String(to_email).trim(),
      author_name: '홍길동',
      capsule_title: targetCapsule.title,
      page_url: pageUrl,
      access_code: targetCapsule.access_code,
      sent_at: new Date().toISOString(),
      email_sent: mailResult.sent,
      email_mode: mailResult.mode,
      email_error: mailResult.error || null,
      email_preview_url: previewUrl,
      email_html: mailResult.html,
    };
    store.notifications.unshift(notification);

    if (!mailResult.sent) {
      throw new HttpError(
        400,
        `네이버/구글 SMTP 로그인 실패 (${mailResult.error}). 네이버 메일은 [환경설정 -> POP3/IMAP 설정 -> 사용함] 확인, 구글 Gmail은 일반 비밀번호가 아닌 [16자리 앱 비밀번호]를 입력해야 합니다. (계정 없이 테스트하려면 발신자 이메일/비밀번호 칸을 비워두고 눌러주세요!)`
      );
    }

    res.status(200).json({
      success: true,
      message: `${to_email} 주소로 타임캡슐 초대 이메일이 발송되었습니다!`,
      data: {
        to_email,
        mode: mailResult.mode,
        access_code: targetCapsule.access_code,
        page_url: pageUrl,
        preview_url: previewUrl,
      },
    });
  })
);

// ================= 아래부터는 로그인한 작성자 전용 API =================
router.use(authenticate);

/**
 * [CAP-01] 3. 새 타임캡슐 봉인(등록) (POST /api/time-capsules)
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { title, message, open_date, recipient_email } = req.body || {};

    if (!title || !message || !open_date) {
      throw new HttpError(400, '제목(title), 전달 메시지(message), 개봉 지정일(open_date)을 모두 입력해주세요.');
    }

    const parsedDate = new Date(open_date);
    if (isNaN(parsedDate.getTime())) {
      throw new HttpError(400, '올바른 개봉 지정일(open_date) 날짜 형식이 아닙니다.');
    }

    const newCapsule = {
      capsule_id: seq.capsule_id++,
      user_id: req.user.user_id,
      title: String(title).trim(),
      message: String(message).trim(),
      open_date: parsedDate.toISOString(),
      is_opened: false,
      recipient_email: recipient_email ? String(recipient_email).trim() : null,
      access_code: null,
      code_generated_at: null,
      first_visited_at: null,
      expires_at: null,
    };

    store.time_capsules.push(newCapsule);

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const { dispatchedList } = await processTimeCapsuleLifecycle(baseUrl);
    const firstNotif = dispatchedList[0]
      ? (({ email_html, ...rest }) => rest)(dispatchedList[0])
      : null;

    res.status(201).json({
      success: true,
      message: '타임캡슐이 성공적으로 봉인되었습니다.',
      data: {
        capsule_id: newCapsule.capsule_id,
        user_id: newCapsule.user_id,
        title: newCapsule.title,
        open_date: newCapsule.open_date,
        is_opened: newCapsule.is_opened,
        access_code: newCapsule.access_code,
      },
      notification: firstNotif,
    });
  })
);

/**
 * [CAP-02] 4. 내 타임캡슐 목록 조회 (GET /api/time-capsules)
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    await processTimeCapsuleLifecycle(baseUrl);

    const myCapsules = store.time_capsules
      .filter((c) => c.user_id === req.user.user_id)
      .map((c) => ({
        capsule_id: c.capsule_id,
        user_id: c.user_id,
        title: c.title,
        message: c.is_opened ? c.message : null,
        open_date: c.open_date,
        is_opened: c.is_opened,
        access_code: c.access_code,
        first_visited_at: c.first_visited_at,
        expires_at: c.expires_at,
      }));

    res.status(200).json({
      success: true,
      data: myCapsules,
    });
  })
);

/**
 * [CAP-02] 5. 타임캡슐 상세 조회 (GET /api/time-capsules/:capsule_id)
 */
router.get(
  '/:capsule_id',
  asyncHandler(async (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    await processTimeCapsuleLifecycle(baseUrl);

    const capsuleId = Number(req.params.capsule_id);
    const capsule = store.time_capsules.find(
      (c) => c.capsule_id === capsuleId && c.user_id === req.user.user_id
    );

    if (!capsule) {
      throw new HttpError(
        404,
        '해당 타임캡슐을 찾을 수 없습니다. (첫 방문 후 14일이 지나 자동 삭제되었거나 존재하지 않습니다.)'
      );
    }

    if (!capsule.is_opened) {
      return res.status(403).json({
        success: false,
        error: {
          status: 403,
          message: capsule.access_code
            ? `개봉일이 도래하여 6자리 보안 초대 코드(${capsule.access_code})가 이메일로 발송되었습니다. 수신자 열람 페이지(/capsule-view)에서 코드를 입력해 개봉해 주세요.`
            : `아직 개봉 지정일(${capsule.open_date})이 도래하지 않아 열람할 수 없습니다.`,
          open_date: capsule.open_date,
          is_opened: capsule.is_opened,
          access_code: capsule.access_code,
        },
      });
    }

    res.status(200).json({
      success: true,
      data: capsule,
    });
  })
);

module.exports = {
  router,
  processTimeCapsuleLifecycle,
};
