const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
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
    
    const otherRole = role === 'interviewer' ? 'candidate' : 'interviewer';
    const otherUserId = rooms[roomId][otherRole];
    
    socket.emit('room-joined', {
      roomId: roomId,
      role: role,
      otherPeerId: otherUserId
    });
    
    if (otherUserId) {
      io.to(otherUserId).emit('peer-joined', {
        peerId: socket.id,
        role: role,
        userName: userName
      });
    }
  });

  socket.on('offer', (data) => {
    const targetId = data.targetId;
    console.log(`📤 Relaying offer from ${socket.id} to ${targetId}`);
    io.to(targetId).emit('offer', {
      offer: data.offer,
      senderId: socket.id
    });
  });

  socket.on('answer', (data) => {
    const targetId = data.targetId;
    console.log(`📤 Relaying answer from ${socket.id} to ${targetId}`);
    io.to(targetId).emit('answer', {
      answer: data.answer,
      senderId: socket.id
    });
  });

  socket.on('ice-candidate', (data) => {
    const { candidate, targetId } = data;
    
    if (targetId) {
      console.log(`🧊 Relaying ICE candidate to ${targetId}`);
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
        rooms[roomId].interviewer = null;
      }
      if (rooms[roomId].candidate === socket.id) {
        rooms[roomId].candidate = null;
      }
      
      if (!rooms[roomId].interviewer && !rooms[roomId].candidate) {
        delete rooms[roomId];
      }
    });
  });
});
// Add this route anywhere before server.listen()
app.post('/api/ai-detect', async (req, res) => {
  const { text, model } = req.body;
  if (!text || !model) {
    return res.status(400).json({ error: 'Missing text or model parameter' });
  }
  
  try {
    const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: text, options: { wait_for_model: true } })
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json(err);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
server.listen(PORT, () => {
  console.log(`🚀 Signaling server running on http://localhost:${PORT}`);
});
