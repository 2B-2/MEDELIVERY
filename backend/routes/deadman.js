const express = require('express');
const {
  store,
  seq,
  toPublicUser,
  generateSixCharInviteCode,
  saveStoreToDisk,
} = require('../db/store');
const { HttpError, asyncHandler } = require('../middleware/auth');
const { sendTimeCapsuleInviteEmail } = require('../utils/mailer');

const router = express.Router();

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * [DMS-01] 데드맨 스위치 자동 감지 및 이메일 발송 라이프사이클
 * 1) 첫 유족 방문(archive_first_visited_at) 후 14일이 지난 아카이브 자동 만료/삭제
 * 2) 현재 시각 - last_active_at >= inactivity_days 인 미접속 사용자를 감지하여
 *    6자리 특수문자 보안 코드(users.access_code)를 생성하고 Nodemailer로 이메일 자동 발송!
 */
async function processDeadmanSwitchLifecycle(
  baseUrl = 'http://localhost:4000',
  options = {}
) {
  const { targetAccountId, forceTrigger, simulateExpiredAccountId } = options;
  const now = new Date();
  const triggeredList = [];
  const expiredAccounts = [];

  for (const user of store.users) {
    // 테스트용: 첫 방문 후 14일 경과 시뮬레이션
    if (simulateExpiredAccountId && user.account_id === simulateExpiredAccountId) {
      user.archive_first_visited_at = new Date(
        now.getTime() - 15 * 24 * 60 * 60 * 1000
      ).toISOString();
    }

    // A. 첫 유족 방문 후 14일 경과 여부 검사 (자동 삭제/만료)
    if (user.archive_first_visited_at) {
      const firstVisitMs = new Date(user.archive_first_visited_at).getTime();
      if (now.getTime() - firstVisitMs >= FOURTEEN_DAYS_MS) {
        // 해당 사용자의 아카이브 기록(일기, 자서전, 타임캡슐) 자동 삭제 및 코드 만료
        store.diaries = store.diaries.filter((d) => d.user_id !== user.user_id);
        const userItvIds = store.interviews
          .filter((i) => i.user_id === user.user_id)
          .map((i) => i.interview_id);
        store.interviews = store.interviews.filter((i) => i.user_id !== user.user_id);
        store.interviewQs = store.interviewQs.filter(
          (q) => !userItvIds.includes(q.interview_id)
        );
        store.time_capsules = store.time_capsules.filter(
          (c) => c.user_id !== user.user_id
        );

        user.access_code = null;
        user.archive_expired = true;
        expiredAccounts.push(user.account_id);
        continue;
      }
    }

    if (targetAccountId && user.account_id !== targetAccountId) continue;

    const lastActive = user.last_active_at
      ? new Date(user.last_active_at)
      : new Date(user.created_at);
    const elapsedDays =
      (now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24);
    const thresholdDays = user.inactivity_days || 90;

    // B. 미접속 기준 일수(inactivity_days) 초과 감지 (또는 시연용 즉시 발동 forceTrigger)
    if ((elapsedDays >= thresholdDays || forceTrigger) && !user.deadman_notified) {
      const inviteCode = generateSixCharInviteCode();
      const generatedAt = now.toISOString();

      user.access_code = inviteCode;
      user.code_generated_at = generatedAt;
      user.deadman_notified = true;
      user.archive_expired = false;

      const pageUrl = `${baseUrl}/capsule-view?mode=deadman&user_id=${user.user_id}`;
      const recipientContact = user.emergency_contact || 'recipient@example.com';

      // Nodemailer 이메일 자동 발송 (데드맨 스위치 모드)
      const mailResult = await sendTimeCapsuleInviteEmail({
        toEmail: recipientContact,
        authorName: user.username,
        capsuleTitle: `${user.username}님의 전체 디지털 유산 아카이브`,
        pageUrl,
        inviteCode,
        isDeadmanSwitch: true,
        inactivityDays: thresholdDays,
      });

      const notificationId = seq.notification_id++;
      const previewUrl =
        mailResult.preview_url || `${baseUrl}/email-preview/${notificationId}`;

      const notification = {
        notification_id: notificationId,
        type: 'DEADMAN_SWITCH',
        user_id: user.user_id,
        account_id: user.account_id,
        recipient_contact: recipientContact,
        author_name: user.username,
        capsule_title: `[데드맨 스위치] ${user.username}님의 전체 아카이브 (일기·자서전·타임캡슐)`,
        page_url: pageUrl,
        access_code: inviteCode,
        sent_at: generatedAt,
        email_sent: mailResult.sent,
        email_mode: mailResult.mode,
        email_preview_url: previewUrl,
        email_html: mailResult.html,
      };

      store.notifications.unshift(notification);
      triggeredList.push(notification);
    }
  }

  if (triggeredList.length > 0 || expiredAccounts.length > 0) {
    saveStoreToDisk();
  }

  return { triggeredList, expiredAccounts };
}

/**
 * [DMS-01] 1. 미접속 감지 실행 및 유족 보안 코드 이메일 발송 (POST /api/deadman/check)
 * - 스케줄러가 주기적으로 자동 호출하며, 테스트 콘솔에서 버튼 클릭 시에도 호출됩니다.
 */
router.post(
  '/check',
  asyncHandler(async (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const { account_id, force, simulate_expired_account_id, to_email } = req.body || {};

    // 테스트 시 수신 이메일을 지정한 경우 해당 유저의 emergency_contact에 반영하고 재발송 허용
    if (account_id && force) {
      const targetUser = store.users.find((u) => u.account_id === account_id);
      if (targetUser) {
        if (to_email && String(to_email).trim()) {
          targetUser.emergency_contact = String(to_email).trim();
        }
        targetUser.deadman_notified = false;
      }
    }

    const { triggeredList, expiredAccounts } = await processDeadmanSwitchLifecycle(
      baseUrl,
      {
        targetAccountId: account_id,
        forceTrigger: Boolean(force),
        simulateExpiredAccountId: simulate_expired_account_id,
      }
    );

    res.status(200).json({
      success: true,
      message: `데드맨 스위치 점검 완료 (신규 유족 코드 이메일 발송: ${triggeredList.length}건, 14일 경과 아카이브 자동 삭제: ${expiredAccounts.length}건)`,
      dispatched: triggeredList.map(({ email_html, ...rest }) => rest),
      expired_accounts: expiredAccounts,
    });
  })
);

/**
 * [DMS-02] 2. 유족(수신자) 6자리 고유 코드 인증 및 전체 아카이브(일기+자서전+타임캡슐) 전달
 * - POST /api/deadman/verify
 * - 대상 필드: users (access_code, code_generated_at, is_code_verified, is_transferred)
 * - 인증 성공 시 is_code_verified = true, is_transferred = true로 갱신하고,
 *   첫 방문 시각 기준 14일 카운트다운을 시작하며 고인의 전체 기록을 반환합니다.
 */
router.post(
  '/verify',
  asyncHandler(async (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    await processDeadmanSwitchLifecycle(baseUrl);

    const { access_code } = req.body || {};
    if (!access_code || String(access_code).length !== 6) {
      throw new HttpError(400, '6자리 보안 초대 코드를 정확히 입력해 주세요.');
    }

    const inputCode = String(access_code);
    const user = store.users.find((u) => u.access_code === inputCode);

    if (!user) {
      throw new HttpError(
        401,
        '보안 초대 코드가 일치하지 않거나, 첫 방문 후 14일이 경과하여 이미 영구 삭제된 아카이브입니다.'
      );
    }

    const now = new Date();
    if (!user.archive_first_visited_at) {
      user.archive_first_visited_at = now.toISOString();
      user.archive_expires_at = new Date(
        now.getTime() + FOURTEEN_DAYS_MS
      ).toISOString();
    }

    // [DMS-02] 유족 코드 인증 완료 및 아카이브 권한 전달 상태 갱신!
    user.is_code_verified = true;
    user.is_transferred = true;

    // 고인의 모든 일기, 자서전(단원 + 문답), 타임캡슐 조회
    const diaries = store.diaries
      .filter((d) => d.user_id === user.user_id)
      .sort((a, b) => a.diary_id - b.diary_id);

    const interviews = store.interviews
      .filter((i) => i.user_id === user.user_id)
      .sort((a, b) => a.interview_id - b.interview_id)
      .map((i) => ({
        ...i,
        questions: store.interviewQs
          .filter((q) => q.interview_id === i.interview_id)
          .sort((a, b) => a.question_id - b.question_id),
      }));

    const time_capsules = store.time_capsules
      .filter((c) => c.user_id === user.user_id)
      .map((c) => {
        c.is_opened = true;
        return c;
      });

    saveStoreToDisk();

    const remainingMs = new Date(user.archive_expires_at).getTime() - now.getTime();
    const remainingDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));

    res.status(200).json({
      success: true,
      mode: 'DEADMAN_ARCHIVE',
      message: '유족 보안 코드 인증이 완료되어 고인의 전체 아카이브 열람 권한이 전달되었습니다.',
      data: {
        user: toPublicUser(user),
        first_visited_at: user.archive_first_visited_at,
        expires_at: user.archive_expires_at,
        remaining_days: remainingDays,
        diaries,
        interviews,
        time_capsules,
      },
    });
  })
);

module.exports = {
  router,
  processDeadmanSwitchLifecycle,
};
