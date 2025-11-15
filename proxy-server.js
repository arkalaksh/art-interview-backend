// const express = require('express');
// const fetch = require('node-fetch');
// const cors = require('cors');
// const app = express();

// app.use(cors());
// app.use(express.json());

// app.post('/api/ai-detect', async (req, res) => {
//   const { text, model } = req.body;

//   try {
//     const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ inputs: text, options: { wait_for_model: true } })
//     });

//     if (!response.ok) {
//       const err = await response.json();
//       return res.status(response.status).json(err);
//     }

//     const data = await response.json();
//     res.json(data);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// app.listen(4000, () => {
//   console.log('API proxy server running on port 4000');
// });
