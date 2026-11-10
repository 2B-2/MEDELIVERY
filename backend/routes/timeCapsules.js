const express = require('express');
const router = express.Router();
// 실제로는 아래처럼 DB 연결 파일을 불러와서 사용합니다.
// const db = require('../db'); 

// 1. 내 타임캡슐 목록 조회 API (GET)
router.get('/', async (req, res) => {
  try {
    // DB에서 타임캡슐 데이터 꺼내오기 (가상의 DB 쿼리)
    // const [rows] = await db.query('SELECT * FROM time_capsules WHERE user_id = ?', [1]);
    
    // 지금은 에러 방지를 위해 rows를 빈 배열로 둡니다.
    const rows = []; 

    res.json({ 
      success: true, 
      data: rows 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: '서버 에러가 발생했습니다.' });
  }
});

// 2. 새 타임캡슐 봉인(등록) API (POST)
router.post('/', async (req, res) => {
  try {
    // 1) 프론트엔드가 보낸 데이터(JSON)를 req.body에서 꺼내기
    const { title, message, open_date } = req.body; 
    const user_id = 1; // (나중에는 로그인한 유저의 토큰에서 ID를 빼옵니다)

    // 2) 데이터 유효성 검사 (빈칸 방지)
    if (!title || !message || !open_date) {
      return res.status(400).json({ success: false, message: '제목, 메시지, 개봉일을 모두 입력해주세요.' });
    }

    // 3) DB에 진짜로 저장하기 (가상의 DB 쿼리)
    /*
    const sql = `INSERT INTO time_capsules (user_id, title, message, open_date, is_opened) VALUES (?, ?, ?, ?, false)`;
    const [result] = await db.query(sql, [user_id, title, message, open_date]);
    */

    res.json({ 
      success: true, 
      message: '타임캡슐이 성공적으로 DB에 저장되었습니다.'
      // data: { id: result.insertId, title, message } // 방금 넣은 데이터 정보
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'DB 저장 중 에러가 발생했습니다.' });
  }
});

module.exports = router;