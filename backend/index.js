const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());


const timeCapsuleRouter = require('./routes/timeCapsules');
app.use('/api/time-capsules', timeCapsuleRouter);
// ------------------------------------

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});