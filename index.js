const server = require('http').createServer(); //start server
const io = require('socket.io')(server); //bind to server
const PORT = 5000; 
const HOST = "localhost";

const gameOverMat = [
    [[0, 0], [0, 1], [0, 2]],
    [[1, 0], [1, 1], [1, 2]],
    [[2, 0], [2, 1], [2, 2]],
    [[0, 0], [1, 0], [2, 0]],
    [[0, 1], [1, 1], [2, 1]],
    [[0, 2], [1, 2], [2, 2]],
    [[0, 0], [1, 1], [2, 2]],
    [[0, 2], [1, 1], [2, 0]]
];
const sockets = {}; // clients
const plays = {};
const players = {}; //player data

 


io.on('connection', client => {
    console.log("connected : " + client.id);
    client.emit('connected', { "id": client.id });
    

    // find opponets
    client.on('getOpponents', data => {
        let response = [];
        for (let id in sockets) {
            if (id !== client.id && !sockets[id].is_playing) {
                response.push({
                    id: id,
                    email: sockets[id].email,
                    played: players[sockets[id].email].played,
                    won: players[sockets[id].email].won,
                    draw: players[sockets[id].email].draw
                });
            }
        }
        client.emit('getOpponentsResponse', response);
        client.broadcast.emit('newOpponentAdded', {
            id: client.id,
            email: sockets[client.id].email,
            played: players[sockets[client.id].email].played,
            won: players[sockets[client.id].email].won,
            draw: players[sockets[client.id].email].draw
        });
    });

    // registerion validation
    client.on('checkUserDetail', data => {
        let flag = false;
        for (let id in sockets) {
            if (sockets[id].email === data.email) {
                flag = true;
                break;
            }
        }
        if (!flag) {
            sockets[client.id] = {
                email: data.email,
                is_playing: false,
                game_id: null
            };

            let flag1 = false;
            for (let id in players) {
                if (id === data.email) {
                    flag1 = true;
                    break;
                }
            }
            if (!flag1) {
                players[data.email] = {
                    played: 0,
                    won: 0,
                    draw: 0
                };
            }

        }
        client.emit('checkUserDetailResponse', !flag);
    });


    // selected opponent
    client.on('selectOpponent', data => {
        let response = { status: false, message: "Opponent is playing with someone else." };
        if (!sockets[data.id].is_playing) {
            let gameId = randomId();
            sockets[data.id].is_playing = true;
            sockets[client.id].is_playing = true;
            sockets[data.id].game_id = gameId;
            sockets[client.id].game_id = gameId;
            players[sockets[data.id].email].played = players[sockets[data.id].email].played + 1;
            players[sockets[client.id].email].played = players[sockets[client.id].email].played + 1;

            plays[gameId] = {
                player1: client.id,
                player2: data.id,
                whose_turn: client.id,
                playboard: [["", "", ""], ["", "", ""], ["", "", ""]],
                game_status: "ongoing", // "ongoing","won","draw"
                game_winner: null, // winner_id if status won
                winning_combination: []
            };
            plays[gameId][client.id] = {
                email: sockets[client.id].email,
                sign: "x",
                played: players[sockets[client.id].email].played,
                won: players[sockets[client.id].email].won,
                draw: players[sockets[client.id].email].draw
            };
            plays[gameId][data.id] = {
                email: sockets[data.id].email,
                sign: "o",
                played: players[sockets[data.id].email].played,
                won: players[sockets[data.id].email].won,
                draw: players[sockets[data.id].email].draw
            };
            io.sockets.connected[client.id].join(gameId);
            io.sockets.connected[data.id].join(gameId);
            io.emit('excludePlayers', [client.id, data.id]);
            io.to(gameId).emit('gameStarted', { status: true, game_id: gameId, game_data: plays[gameId] });

        }
    });

    let gameBetweenSeconds = 10; // Time between next game
    let gameBetweenInterval = null;

   //client click
    client.on('selectCell', data => {
        plays[data.gameId].playboard[data.i][data.j] = plays[data.gameId][plays[data.gameId].whose_turn].sign;

        let draw = true;
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                if (plays[data.gameId].playboard[i][j] == "") {
                    draw = false;
                    break;
                }
            }
        }
        if (draw)
            plays[data.gameId].game_status = "draw";


        for (let i = 0; i < gameOverMat.length; i++) {
            let tempComb = plays[data.gameId].playboard[gameOverMat[i][0][0]][gameOverMat[i][0][1]] + plays[data.gameId].playboard[gameOverMat[i][1][0]][gameOverMat[i][1][1]] + plays[data.gameId].playboard[gameOverMat[i][2][0]][gameOverMat[i][2][1]];
            if (tempComb === "xxx" || tempComb === "ooo") {
                plays[data.gameId].game_winner = plays[data.gameId].whose_turn;
                plays[data.gameId].game_status = "won";
                plays[data.gameId].winning_combination = [[gameOverMat[i][0][0], gameOverMat[i][0][1]], [gameOverMat[i][1][0], gameOverMat[i][1][1]], [gameOverMat[i][2][0], gameOverMat[i][2][1]]];
                players[plays[data.gameId][plays[data.gameId].game_winner].email].won++;
            }
        }
        if (plays[data.gameId].game_status == "draw") {
            players[plays[data.gameId][plays[data.gameId].player1].email].draw++;
            players[plays[data.gameId][plays[data.gameId].player2].email].draw++;
        }
        plays[data.gameId].whose_turn = plays[data.gameId].whose_turn == plays[data.gameId].player1 ? plays[data.gameId].player2 : plays[data.gameId].player1;
        io.to(data.gameId).emit('selectCellResponse', plays[data.gameId]);

        if (plays[data.gameId].game_status == "draw" || plays[data.gameId].game_status == "won") {
            gameBetweenSeconds = 10;
            gameBetweenInterval = setInterval(() => {
                gameBetweenSeconds--;
                io.to(data.gameId).emit('gameInterval', gameBetweenSeconds);
                if (gameBetweenSeconds == 0) {
                    clearInterval(gameBetweenInterval);

                    let gameId = randomId();
                    sockets[plays[data.gameId].player1].game_id = gameId;
                    sockets[plays[data.gameId].player2].game_id = gameId;
                    players[sockets[plays[data.gameId].player1].email].played = players[sockets[plays[data.gameId].player1].email].played + 1;
                    players[sockets[plays[data.gameId].player2].email].played = players[sockets[plays[data.gameId].player2].email].played + 1;

                    plays[gameId] = {
                        player1: plays[data.gameId].player1,
                        player2: plays[data.gameId].player2,
                        whose_turn: plays[data.gameId].game_status == "won" ? plays[data.gameId].game_winner : plays[data.gameId].whose_turn,
                        playboard: [["", "", ""], ["", "", ""], ["", "", ""]],
                        game_status: "ongoing", // "ongoing","won","draw"
                        game_winner: null, // winner_id if status won
                        winning_combination: []
                    };
                    plays[gameId][plays[data.gameId].player1] = {
                        email: sockets[plays[data.gameId].player1].email,
                        sign: "x",
                        played: players[sockets[plays[data.gameId].player1].email].played,
                        won: players[sockets[plays[data.gameId].player1].email].won,
                        draw: players[sockets[plays[data.gameId].player1].email].draw
                    };
                    plays[gameId][plays[data.gameId].player2] = {
                        email: sockets[plays[data.gameId].player2].email,
                        sign: "o",
                        played: players[sockets[plays[data.gameId].player2].email].played,
                        won: players[sockets[plays[data.gameId].player2].email].won,
                        draw: players[sockets[plays[data.gameId].player2].email].draw
                    };
                    io.sockets.connected[plays[data.gameId].player1].join(gameId);
                    io.sockets.connected[plays[data.gameId].player2].join(gameId);
            
                    io.to(gameId).emit('nextGameData', { status: true, game_id: gameId, game_data: plays[gameId] });

                    io.sockets.connected[plays[data.gameId].player1].leave(data.gameId);
                    io.sockets.connected[plays[data.gameId].player2].leave(data.gameId);
                    delete plays[data.gameId];
                }
            }, 1000);
        }

    });

  
    client.on('disconnect', () => {
        console.log("disconnect : " + client.id);
        if (typeof sockets[client.id] != "undefined") {
            if (sockets[client.id].is_playing) {
            
                io.to(sockets[client.id].game_id).emit('opponentLeft', {});
                players[sockets[plays[sockets[client.id].game_id].player1].email].played--;
                players[sockets[plays[sockets[client.id].game_id].player2].email].played--;
                io.sockets.connected[client.id == plays[sockets[client.id].game_id].player1 ? plays[sockets[client.id].game_id].player2 : plays[sockets[client.id].game_id].player1].leave(sockets[client.id].game_id);
                delete plays[sockets[client.id].game_id];
            }
        }
        delete sockets[client.id];
        client.broadcast.emit('opponentDisconnected', {
            id: client.id
        });
    });
});


server.listen(PORT, HOST); 
console.log("listening on : " + HOST + ":" + PORT);


// Generate Game ID
function randomId() {
    return 'xxxxxxy'.replace(/[xy]/g,  (c) =>{
        let r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}