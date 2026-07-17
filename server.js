const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname + '/public'));

let waitingQueue = [];

io.on('connection', (socket) => {
    socket.on('join_match', (userData) => {
        socket.userData = {
            nickname: userData.nickname || '神秘人',
            pronoun: userData.pronoun || '不透露',
            tags: userData.tags || [],
            otherFetish: (userData.otherFetish || '').trim().toLowerCase()
        };
        
        waitingQueue.push(socket);
        socket.emit('status', '正在同步解密BB通道，尋找相容的信號...');
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

    socket.on('disconnect', () => { handleDisconnect(socket); });
    socket.on('leave_room', () => { handleDisconnect(socket); });
});

function checkAndMatch() {
    if (waitingQueue.length < 2) return;

    for (let i = 0; i < waitingQueue.length; i++) {
        for (let j = i + 1; j < waitingQueue.length; j++) {
            const u1 = waitingQueue[i];
            const u2 = waitingQueue[j];

            // --- 核心改動：角色角色相容性檢查 ---
            const t1 = u1.userData.tags;
            const t2 = u2.userData.tags;

            // 1. Dom/Sub 衝突檢查 (兩邊都是Dom，或兩邊都是Sub，則不允許配對)
            const isBothDom = t1.includes('Dom/Master') && t2.includes('Dom/Master');
            const isBothSub = t1.includes('Sub/Slave') && t2.includes('Sub/Slave');
            
            // 2. S/M 衝突檢查 (兩邊都是S，或兩邊都是M，則不允許配對)
            const isBothSadism = t1.includes('Sadism') && t2.includes('Sadism');
            const isBothMasochism = t1.includes('Masochism') && t2.includes('Masochism');

            // 觸發角色互斥判定（除非其中有人有勾 Switch，否則同行相斥）
            const hasSwitch1 = t1.includes('Switch');
            const hasSwitch2 = t2.includes('Switch');

            if ((isBothDom && !hasSwitch1 && !hasSwitch2) || 
                (isBothSub && !hasSwitch1 && !hasSwitch2) ||
                (isBothSadism && !hasSwitch1 && !hasSwitch2) || 
                (isBothMasochism && !hasSwitch1 && !hasSwitch2)) {
                continue; // 角色衝突，跳過此人，尋找下一個
            }

            // --- 計算交集標籤 ---
            // 找出常規性癖的交集
            let commonTags = t1.filter(tag => t2.includes(tag) && !['Dom/Master', 'Sub/Slave', 'Sadism', 'Masochism'].includes(tag));

            // 檢查定向配對成功
            let isMatched = false;

            // 情況 A: 一方是 Dom 且另一方是 Sub
            if ((t1.includes('Dom/Master') && t2.includes('Sub/Slave')) || (t1.includes('Sub/Slave') && t2.includes('Dom/Master'))) {
                isMatched = true;
                commonTags.push('DS配對成功');
            }
            // 情況 B: 一方是 Sadism 且另一方是 Masochism
            if ((t1.includes('Sadism') && t2.includes('Masochism')) || (t1.includes('Masochism') && t2.includes('Sadism'))) {
                isMatched = true;
                commonTags.push('SM配對成功');
            }
            // 情況 C: 其他常規性癖（如 Bondage, CNC）有交集
            if (commonTags.length > 0) {
                isMatched = true;
            }
            // 情況 D: 自填欄位完全相同
            const hasCommonOther = u1.userData.otherFetish && u1.userData.otherFetish === u2.userData.otherFetish;
            if (hasCommonOther) {
                isMatched = true;
                commonTags.push(u1.userData.otherFetish);
            }

            // 最終確認配對
            if (isMatched) {
                waitingQueue.splice(j, 1);
                waitingQueue.splice(i, 1);
                executeMatch(u1, u2, commonTags);
                return checkAndMatch(); 
            }
        }
    }
}

function executeMatch(user1, user2, commonTags) {
    const roomName = `room_${user1.id}_${user2.id}`;
    user1.join(roomName);
    user2.join(roomName);
    user1.roomName = roomName;
    user2.roomName = roomName;

    user1.emit('match_success', { target: user2.userData, common: commonTags });
    user2.emit('match_success', { target: user1.userData, common: commonTags });
}

function handleDisconnect(socket) {
    waitingQueue = waitingQueue.filter(s => s.id !== socket.id);
    if (socket.roomName) {
        socket.to(socket.roomName).emit('peer_left', '對方已切斷信號，離開了通道...');
        socket.leave(socket.roomName);
        socket.roomName = null;
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server live on port ${PORT}`));
