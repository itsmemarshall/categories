;
jQuery(function($){
    'use strict';

    /**
     * All the code relevant to Socket.IO is collected in the IO namespace.
     *
     * @type {{init: Function, bindEvents: Function, onConnected: Function, onNewGameCreated: Function, playerJoinedRoom: Function, beginNewGame: Function, onNewWordData: Function, hostCheckAnswer: Function, gameOver: Function, error: Function}}
     */
    var IO = {

        init: function() {
            IO.socket = io.connect();
            IO.bindEvents();
        },

        bindEvents : function() {
            IO.socket.on('connected', IO.onConnected );
            IO.socket.on('newGameCreated', IO.onNewGameCreated );
            IO.socket.on('playerJoinedRoom', IO.playerJoinedRoom );
            IO.socket.on('frequentUpdate', IO.frequentUpdate);
            IO.socket.on('roundOver', IO.roundOver),
            IO.socket.on('timerStarted', IO.timerStarted)
        },

        onConnected : function() {
            App.mySocketId = IO.socket.id;
        },

        onNewGameCreated : function(data) {
            App.Host.gameInit(data);
        },

        playerJoinedRoom : function(data) {
            App[App.myRole].updateWaitingScreen(data);

        },

        onStartTimer: function() {
          IO.socket.emit('startTimer');
        },

        onNextCategory: function() {
          IO.socket.emit('nextCategory');
        },

        timerStarted: function(data) {
          App.$gameArea.html(App.$templateMainGame);

          // Update categories
          $("#categoryList").empty()
          for (let j = 0; j < data.categoriesPerRound; j++) {
            $("#categoryList").append("<li></li>")
          }

          // Update answer sheets
          for (let round = 0; round < data.rounds; round++) {
            $(`#answerSheet${round}`).empty()
            for (let j = 0; j < data.categoriesPerRound; j++) {
              $(`#answerSheet${round}`).append(`<li><input type="text" id="answerRound${round}Category${j}" disabled="disabled"></input></li>`)
            }

          }
        },

        roundOver: function(data) {
          if (App.myRole === "Player") {
            let playerAnswers = []
            $(`#answerSheet${data.currentRound}`).find("input").each(function() {
              playerAnswers.push($(this).val());
            })
            console.log("roundOver")
            console.log(App.Player.myName)
            IO.socket.emit('collectedPlayerResponses', {playerAnswers: playerAnswers, playerName: App.Player.myName, currentRound: data.currentRound})
            App.$gameArea.html(App.$templateRoundResults);

          }
        },

        frequentUpdate: function(data) {



          //
          // Before the game starts.
          //

          if (data.gameState === "pregame") {

            IO.updateInRoundElements(data);

            // Keep all text boxes locked.
            for (let round = 0; round < data.rounds; round++) {
              $(`#answerSheet${round}`).find("input").attr("disabled", "disabled")
            }

          //
          // During the round.
          //

          } else if (data.gameState === "inRound") {

            IO.updateInRoundElements(data);

            // Unlock current round's text boxes.
            for (let round = 0; round < data.rounds; round++) {
              if (round == data.currentRound) {
                $(`#answerSheet${round}`).find("input").each(function() {
                  if(this.hasAttribute("disabled")) {this.removeAttribute("disabled");}
                })
              } else { $(`#answerSheet${round}`).find("input").attr("disabled", "disabled")}
            }

          //
          // If results are being shown.
          //

          } else if (data.gameState === "showResults") {

            if (App.myRole === "Player") {

              $("#roundAnswersTable").empty()
              $("#currentRoundShower").html(`Round ${data.currentRound + 1} Results`)
              $("#roundResultsCategoryN").html(`Comparing Answers for Category ${data.showingResultsForCategoryN + 1} / ${data.categoriesPerRound}`)

              if (data.showingResultsForCategoryN < data.categoriesPerRound - 1) {
                $("#roundResultsButtonHolder").empty()
                $("#roundResultsButtonHolder").html("<button id='btnNextCategory' value='word'>Next Category</button>")
              } else {
                $("#roundResultsButtonHolder").empty()
                $("#roundResultsButtonHolder").html("<button id='btnNextRound' value='word'>Start next round</button>")
              }

              // Populate current category.
              $("#roundAnswersTable").append('<tr id="roundAnswersCategoriesRow"></tr>')
              $("#roundAnswersCategoriesRow").append("<th class='rowTitle'>Category</td>")
              $("#roundAnswersCategoriesRow").append("<th>".concat(data.categories[data.currentRound][data.showingResultsForCategoryN]).concat("</td>"))

              // Populate point inputs.
              $("#roundAnswersTable").append('<tr id="pointInputsRow"></tr>')
              $("#pointInputsRow").append("<td class='rowTitle'>My Points</td>")
              $("#pointInputsRow").append("<td><input class='pointInput'></input>")

              // Populate my answers.
              let me = IO.findPlayerObject(data.players, App.Player.myName)
              $("#roundAnswersTable").append('<tr id="myAnswersRow"></tr>')
              $("#myAnswersRow").append("<td class='rowTitle'>My Answers</td>")
              $("#myAnswersRow").append("<td>" + me.answers[data.currentRound][data.showingResultsForCategoryN] + "</td>")

              // Populate others' answers.
              for (let player of data.players) {
                $("#roundAnswersTable").append("<tr class='othersAnswersRow' id='" + player.playerName + "AnswersRow'></tr>")
                $("#" + player.playerName + "AnswersRow").append("<td class='rowTitle'>" + player.playerName + "</td>")
                $("#" + player.playerName + "AnswersRow").append("<td>" + player.answers[data.currentRound][data.showingResultsForCategoryN] + "</td>")
              }
            }

          } else {

            console.log("incorrect state")

          }

        },

        updateInRoundElements: function(data) {

          // Update timer
          let remainingMinutes = Math.floor(data.remainingTime / 60);
          let remainingSeconds = (data.remainingTime % 60).toString().padStart(2, "0");
          $("#timeRemaining").html(`${remainingMinutes}:` + remainingSeconds);

          // Update categories
          $("#categoryList").empty()
          for (let j = 0; j < data.categoriesPerRound; j++) {
            $("#categoryList").append("<li>".concat(data.categories[data.currentRound][j]).concat("</li>"))
          }

          // Update letters
          $("#letter").html(data.currentLetter)

          // Update playerName
          $("#playerName").html(App.Player.myName)

          // Update players in  rooms
          $("#leaderboardList").empty()
          console.log(data.players)
          for (let player of data.players) {
            $("#leaderboardList").append("<li>".concat(player.playerName).concat("</li"))
          }

        },

        findPlayerObject: function(playersList, playerName) {
          return playersList.filter(obj => {return obj.playerName == playerName})[0]
        }

    };

    var App = {

        gameId: 0,
        myRole: '',
        mySocketId: '',
        init: function () {
            App.cacheElements();
            App.showInitScreen();
            App.bindEvents();
            FastClick.attach(document.body);
        },

        cacheElements: function () {
            App.$doc = $(document);
            App.$gameArea = $('#gameArea');
            App.$templateIntroScreen = $('#intro-screen-template').html();
            App.$templateNewGame = $('#create-game-template').html();
            App.$templateJoinGame = $('#join-game-template').html();
            App.$templateMainGame = $('#alice_template').html();
            App.$templateRoundResults = $('#round-results-template').html();

        },

        bindEvents: function () {
            App.$doc.on('click', '#btnStartTimer', IO.onStartTimer);
            App.$doc.on('click', '#btnNextCategory', IO.onNextCategory);
            App.$doc.on('click', '#btnNextRound', IO.onStartTimer);
            App.$doc.on('click', '#btnCreateGame', App.Host.onCreateClick);
            App.$doc.on('click', '#btnJoinGame', App.Player.onJoinClick);
            App.$doc.on('click', '#btnStart',App.Player.onPlayerStartClick);
            App.$doc.keyup(function(event) {
              if (event.keyCode == 13) {
                $("btnStart").click();
              }
            })

        },

        showInitScreen: function() {
            App.$gameArea.html(App.$templateIntroScreen);
            App.doTextFit('.title');
        },

        Host : {

            onCreateClick: function () {
                console.log('Clicked "Create A Game"');
                IO.socket.emit('hostCreateNewGame');
                console.log("created game")
            },

            gameInit: function (data) {
                App.gameId = data.gameId;
                App.mySocketId = data.mySocketId;
                App.myRole = 'Host';
                App.Host.numPlayersInRoom = 0;

                App.Host.displayNewGameScreen();
            },

            displayNewGameScreen : function() {
                App.$gameArea.html(App.$templateNewGame);
                $('#gameURL').text(window.location.href);
                App.doTextFit('#gameURL');
                $('#spanNewGameCode').text(App.gameId);
            },

            updateWaitingScreen: function(data) {
                $('#playersWaiting')
                    .append('<p/>')
                    .text('Player ' + data.playerData.playerName + ' joined the game.');
            },
        },

        Player : {

            hostSocketId: '',
            myName: '',
            onJoinClick: function () {
                App.$gameArea.html(App.$templateJoinGame);
            },

            onPlayerStartClick: function() {

                var data = {
                    gameId : 0,
                    playerName : $('#inputPlayerName').val() || 'anon'
                };

                // Send the gameId and playerName to the server
                IO.socket.emit('playerJoinGame', data);

                // Set the appropriate properties for the current player.
                App.myRole = 'Player';
                App.Player.myName = data.playerName;
            },

            updateWaitingScreen : function(data) {
                if(IO.socket.id === data.playerData.mySocketId){
                    App.myRole = 'Player';
                    App.gameId = data.playerData.gameId;
                    App.$gameArea.html(App.$templateMainGame);

                    // Update categories
                    $("#categoryList").empty()
                    for (let j = 0; j < data.categoriesPerRound; j++) {
                      $("#categoryList").append("<li></li>")
                    }

                    // Update answer sheets
                    for (let round = 0; round < data.rounds; round++) {
                      $(`#answerSheet${round}`).empty()
                      for (let j = 0; j < data.categoriesPerRound; j++) {
                        $(`#answerSheet${round}`).append(`<li><input type="text" id="answerRound${round}Category${j}" disabled="disabled"></input></li>`)
                      }
                    }

                }
            },
        },


        /* **************************
                  UTILITY CODE
           ************************** */

        /**
         * Display the countdown timer on the Host screen
         *
         * @param $el The container element for the countdown timer
         * @param startTime
         * @param callback The function to call when the timer ends.
         */
        countDown : function( $el, startTime, callback) {

            // Display the starting time on the screen.
            $el.text(startTime);
            App.doTextFit('#hostWord');

            console.log('Starting Countdown...');

            // Start a 1 second timer
            var timer = setInterval(countItDown,1000);

            // Decrement the displayed timer value on each 'tick'
            function countItDown(){
                startTime -= 1
                $el.text(startTime);
                App.doTextFit('#hostWord');

                if( startTime <= 0 ){
                    console.log('Countdown Finished.');
                    // Stop the timer and do the callback.
                    clearInterval(timer);
                    callback();
                    return;
                }
            }

        },

        /**
         * Make the text inside the given element as big as possible
         * See: https://github.com/STRML/textFit
         *
         * @param el The parent element of some text
         */
        doTextFit : function(el) {
            textFit(
                $(el)[0],
                {
                    alignHoriz:true,
                    alignVert:false,
                    widthOnly:true,
                    reProcess:true,
                    maxFontSize:300
                }
            );
        }

    };

    IO.init();
    App.init();

}($));
