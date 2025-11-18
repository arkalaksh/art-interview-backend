const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json()); // ✅ ADD THIS for API route

let fetch;
(async () => {
  fetch = (await import('node-fetch')).default;
})();

const server = http.createServer(app);

const io = socketIO(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

const PORT = 5000;
const rooms = {};

app.get('/', (req, res) => {
  res.send('✅ Signaling server is running!');
});

io.on('connection', (socket) => {
  console.log(`✅ User connected: ${socket.id}`);

  socket.emit('connected', { socketId: socket.id });

  socket.on('join-room', (data) => {
    const { roomId, role, userName } = data;
    
    socket.join(roomId);
    
    if (!rooms[roomId]) {
      rooms[roomId] = { interviewer: null, candidate: null };
    }
    
    rooms[roomId][role] = socket.id;
    
    console.log(`👤 ${userName} (${role}) joined room: ${roomId}`);
    console.log(`📊 Room state:`, rooms[roomId]); // ✅ ADD THIS
    
    const otherRole = role === 'interviewer' ? 'candidate' : 'interviewer';
    const otherUserId = rooms[roomId][otherRole];
    
    // Confirm to the user they joined
    socket.emit('room-joined', {
      roomId: roomId,
      role: role,
      otherPeerId: otherUserId
    });
    
    // ✅ FIX: Send socketId instead of peerId
    if (otherUserId) {
      console.log(`📤 Notifying ${otherRole} (${otherUserId}) about new peer`);
      io.to(otherUserId).emit('peer-joined', {
        socketId: socket.id,  // ✅ CHANGED from peerId to socketId
        role: role,
        userName: userName
      });
    }
  });

  socket.on('offer', (data) => {
    const targetId = data.targetId;
    console.log(`📤 Relaying offer from ${socket.id} to ${targetId}`);
    
    // ✅ ADD validation
    if (!targetId) {
      console.error('❌ ERROR: targetId is undefined in offer!');
      return;
    }
    
    io.to(targetId).emit('offer', {
      offer: data.offer,
      senderId: socket.id
    });
  });

  socket.on('answer', (data) => {
    const targetId = data.targetId;
    console.log(`📤 Relaying answer from ${socket.id} to ${targetId}`);
    
    // ✅ ADD validation
    if (!targetId) {
      console.error('❌ ERROR: targetId is undefined in answer!');
      return;
    }
    
    io.to(targetId).emit('answer', {
      answer: data.answer,
      senderId: socket.id
    });
  });

  socket.on('ice-candidate', (data) => {
    const { candidate, targetId } = data;
    
    if (targetId) {
      console.log(`🧊 Relaying ICE candidate from ${socket.id} to ${targetId}`);
      io.to(targetId).emit('ice-candidate', {
        candidate: candidate,
        senderId: socket.id
      });
    } else {
      // Find target in rooms
      Object.keys(rooms).forEach(roomId => {
        const room = rooms[roomId];
        if (room.interviewer === socket.id && room.candidate) {
          console.log(`🧊 ICE from interviewer to candidate`);
          io.to(room.candidate).emit('ice-candidate', {
            candidate: candidate,
            senderId: socket.id
          });
        } else if (room.candidate === socket.id && room.interviewer) {
          console.log(`🧊 ICE from candidate to interviewer`);
          io.to(room.interviewer).emit('ice-candidate', {
            candidate: candidate,
            senderId: socket.id
          });
        }
      });
    }
  });

  socket.on('alert', (data) => {
    console.log(`🚨 Alert in room ${data.roomId}: ${data.type}`);
    const interviewer = rooms[data.roomId]?.interviewer;
    if (interviewer) {
      io.to(interviewer).emit('alert', data);
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ User disconnected: ${socket.id}`);
    
    Object.keys(rooms).forEach(roomId => {
      if (rooms[roomId].interviewer === socket.id) {
        console.log(`👨‍💼 Interviewer left room ${roomId}`);
        rooms[roomId].interviewer = null;
      }
      if (rooms[roomId].candidate === socket.id) {
        console.log(`👤 Candidate left room ${roomId}`);
        rooms[roomId].candidate = null;
      }
      
      // Delete empty rooms
      if (!rooms[roomId].interviewer && !rooms[roomId].candidate) {
        console.log(`🗑️ Deleting empty room ${roomId}`);
        delete rooms[roomId];
      }
    });
  });
});

// AI Detection API Route
app.post('/api/ai-detect', async (req, res) => {
  const { text, model } = req.body;
  
  console.log('🤖 AI Detection request received');
  console.log('Model:', model);
  console.log('Text length:', text?.length);
  
  if (!text || !model) {
    console.error('❌ Missing text or model parameter');
    return res.status(400).json({ error: 'Missing text or model parameter' });
  }
  
  try {
    const HF_API_URL = `https://api-inference.huggingface.co/models/${model}`;
    console.log('📤 Calling Hugging Face API:', HF_API_URL);
    
    const response = await fetch(HF_API_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        // ✅ ADD YOUR HUGGING FACE TOKEN HERE IF YOU HAVE ONE
        // 'Authorization': 'Bearer YOUR_HF_TOKEN'
      },
      body: JSON.stringify({ 
        inputs: text, 
        options: { wait_for_model: true } 
      })
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('❌ Hugging Face API error:', err);
      return res.status(response.status).json(err);
    }

    const data = await response.json();
    console.log('✅ AI Detection result:', data);
    
    // ✅ Format response to match what frontend expects
    let score = 0;
    if (Array.isArray(data) && data[0]) {
      // Handle classification response
      const labels = data[0];
      const fakeLabel = labels.find(l => l.label === 'LABEL_1' || l.label === 'Fake' || l.label === 'AI');
      score = fakeLabel ? Math.round(fakeLabel.score * 100) : 0;
    }
    
    res.json({ 
      score, 
      model,
      rawData: data 
    });
    
  } catch (error) {
    console.error('❌ AI Detection error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Signaling server running on http://localhost:${PORT}`);
  console.log(`📡 WebSocket ready for connections`);
  console.log(`🤖 AI Detection API available at http://localhost:${PORT}/api/ai-detect`);
});
