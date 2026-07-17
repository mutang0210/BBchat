const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname + '/public'));

// 儲存正在等待配對的使用者
let waitingQueue = [];

io.on('connection', (socket) => {
    socket.on('join_match', (userData) => {
        // 綁定使用者設定的代名詞、標籤與自填性癖
        socket.userData = {
            nickname: userData.nickname || '神秘人',
            pronoun: userData.pronoun || '不透露',
            tags: userData.tags || [],
            otherFetish: (userData.otherFetish || '').trim().toLowerCase()
        };
        
        waitingQueue.push(socket);
        socket.emit('status', '正在加密連線，尋找頻率相近的陌生人...');

        // 執行精準配對
        checkAndMatch();
    });

    socket.on('send_msg', (msg) => {
        if (socket.roomName) {
            socket.to(socket.roomName).emit('receive_msg', {
                sender: socket.userData.nickname,
                text: msg
            });
        }
    });

    socket.on('disconnect', () => {
        handleDisconnect(socket);
    });
    
    socket.on('leave_room', () => {
        handleDisconnect(socket);
    });
});

function checkAndMatch() {
    if (waitingQueue.length < 2) return;

    // 雙迴圈比對，嘗試找出有交集的人（精準配對）
    for (let i = 0; i < waitingQueue.length; i++) {
        for (let j = i + 1; j < waitingQueue.length; j++) {
            const u1 = waitingQueue[i];
            const u2 = waitingQueue[j];

            // 檢查固定標籤是否有交集
            const hasCommonTag = u1.userData.tags.some(tag => u2.userData.tags.includes(tag));
            
            // 檢查自填欄位是否有交集 (如果不為空且完全相同)
            const hasCommonOther = u1.userData.otherFetish && u1.userData.otherFetish === u2.userData.otherFetish;

            if (hasCommonTag || hasCommonOther) {
                // 找到天選之人，將他們從隊列移除
                waitingQueue.splice(j, 1);
                waitingQueue.splice(i, 1);

                executeMatch(u1, u2);
                return checkAndMatch(); // 遞迴繼續配對剩餘的人
            }
        }
    }

    // [備用機制] 如果佇列內人數累積到一定程度（例如 > 4人）卻一直無法精準配對，
    // 就將最前面的兩個人進行通用配對，避免使用者無限等待
    if (waitingQueue.length >= 4) {
        const u1 = waitingQueue.shift();
        const u2 = waitingQueue.shift();
        executeMatch(u1, u2);
    }
}

function executeMatch(user1, user2) {
    const roomName = `room_${user1.id}_${user2.id}`;
    
    user1.join(roomName);
    user2.join(roomName);

    user1.roomName = roomName;
    user2.roomName = roomName;

    // 將交集的標籤算出來，通知雙方
    const commonTags = user1.userData.tags.filter(tag => user2.userData.tags.includes(tag));
    if (user1.userData.otherFetish && user1.userData.otherFetish === user2.userData.otherFetish) {
        commonTags.push(user1.userData.otherFetish);
    }

    user1.emit('match_success', { target: user2.userData, common: commonTags });
    user2.emit('match_success', { target: user1.userData, common: commonTags });
}

function handleDisconnect(socket) {
    waitingQueue = waitingQueue.filter(s => s.id !== socket.id);
    if (socket.roomName) {
        socket.to(socket.roomName).emit('peer_left', '對方已切斷信號，離開了聊天...');
        socket.leave(socket.roomName);
        socket.roomName = null;
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server is live on port ${PORT}`));
