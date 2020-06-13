var fadeSpeed = 250;
var currentPage = "login"

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
            IO.socket.on('gameOver', IO.gameOver)
            IO.socket.on('updatedNextCategory', IO.updateResultsPage)
            IO.socket.on('collectPlayerPoints', IO.collectPlayerPoints)
            IO.socket.on("updatedPlayerResponses", IO.updatedPlayerResponses)
            IO.socket.on("populateFinalLeaderboard", IO.populateFinalLeaderboard)
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
          console.log("sever-side onNextCategory")
          IO.socket.emit("nextCategoryButtonClicked")

        },

        collectPlayerPoints: function() {

          if (App.myRole === "Player") {

            let myPoints = parseInt($("#myPointsInput").val()) || 0;
            IO.socket.emit('collectedPlayerPoints', {playerName: App.Player.myName, myPoints: myPoints});
          }
        },

        gameOver: function () {

        },

        populateFinalLeaderboard: function(data) {
          // Update players in  rooms
          if (App.myRole === "Player") {

            App.$gameArea.fadeOut(fadeSpeed, function() {
              $(this).html(App.$templateGameOver)
              $("#finalLeaderboard").append("<tr id='finalLeaderboardHeadings'></tr>")
              $("#finalLeaderboardHeadings").append(`<td>Player</td>`)
              for (let r = 0; r < data.rounds; r++) {
                $("#finalLeaderboardHeadings").append(`<td>Round ${r+1}</td>`)
              }
              $("#finalLeaderboardHeadings").append(`<td>Total</td>`)
              for (let element of IO.generateSortedLeaderboard(data)) {

                $("#finalLeaderboard").append("<tr id='finalLeaderboard".concat(element[0]).concat("'></tr>"))
                $("#finalLeaderboard".concat(element[0])).append("<td>".concat(element[0]).concat("</td"))
                for (let r = 0; r < data.rounds; r++) {
                    $("#finalLeaderboard".concat(element[0])).append(`<td>${element[2][r]}</td>`)
                }
                $("#finalLeaderboard".concat(element[0])).append(`<td>${element[1]}</td>`)

              }
            }).fadeIn(fadeSpeed);
          }
        },

        timerStarted: function(data) {
          if (data.currentRound > 0) {
            App.$gameArea.fadeOut(fadeSpeed, function() {
              $(this).html(App.$templateMainGame)
              currentPage = "mainPage"

              // Update categories
              $("#categoryList").empty()
              for (let j = 0; j < data.categoriesPerRound; j++) {
                $("#categoryList").append("<li class = 'catLst'></li>")
              }

              // Update answer sheets
              for (let round = 0; round < data.rounds; round++) {
                $(`#answerSheet${round}`).empty()
                for (let j = 0; j < data.categoriesPerRound; j++) {
                  $(`#answerSheet${round}`).append(`<li><input type="text" id="answerRound${round}Category${j}" disabled="disabled"></input></li>`)
                }
              }
            }).fadeIn(fadeSpeed);

          }

        },

        roundOver: function(data) {
          if (App.myRole === "Player") {
            let playerAnswers = []
            $(`#answerSheet${data.currentRound}`).find("input").each(function() {
              playerAnswers.push($(this).val());
            })
            IO.socket.emit('collectedPlayerResponses', {playerAnswers: playerAnswers, playerName: App.Player.myName, currentRound: data.currentRound})
          }
        },

        updatedPlayerResponses: function(data) {
          if (App.myRole === "Player") {
            currentPage = "roundResults"
            App.$gameArea.fadeOut(fadeSpeed, function() {
              $(this).html(App.$templateRoundResults);
              console.log("initial update page")
              IO.updateResultsPage(data);
            }).fadeIn(fadeSpeed);

            //



          }
        },

        frequentUpdate: function(data) {

          //
          // Before the game starts.
          //

          if (data.gameState === "pregame") {
            if (App.Player.inGame) {
              IO.updateInRoundElements(data, false);

              // Keep all text boxes locked.
              for (let round = 0; round < data.rounds; round++) {
                $(`#answerSheet${round}`).find("input").attr("disabled", "disabled")
              }
            }

          //
          // During the round.
          //

          } else if (data.gameState === "inRound") {

            IO.updateInRoundElements(data, true);

            // Unlock current round's text boxes.
            for (let round = 0; round < data.rounds; round++) {
              if (round == data.currentRound) {
                $(`#answerSheet${round}`).find("input").each(function() {
                  if(this.hasAttribute("disabled")) {this.removeAttribute("disabled");}
                })
              } else { $(`#answerSheet${round}`).find("input").attr("disabled", "disabled")}
            }

            // Fill in previous round answers.
            let me = IO.findPlayerObject(data.players, App.Player.myName)
            for (let round = 0; round < data.rounds; round++) {
              if (round < data.currentRound) {
                for (let j = 0; j < data.categoriesPerRound; j++) {
                    $(`#answerRound${round}Category${j}`).val(me.answers[round][j])
                }
              }
            }

          //
          // If results are being shown.
          //

          } else if (data.gameState === "showResults") {

            IO.updateInRoundElements(data, false)

            // Prevent next round until everyone typed something.
            if (App.myRole === "Player") {
              if (!isNaN(parseInt($("#myPointsInput").val()))) {
                IO.socket.emit("updateRoundResultsStatus", {answerEntered: true, playerName: App.Player.myName})
              } else {
                IO.socket.emit("updateRoundResultsStatus", {answerEntered: false, playerName: App.Player.myName})
              }
            }

            if (data.players.map(player => player.answerEntered).every(x => x)) {
              if ($("#btnNextCategory").prop("disabled")) {
                  $('#btnNextCategory').prop('disabled', false);
                  $('#btnNextCategory').html("Next Category");
              }
              if ($("#btnNextRound").prop("disabled")) {
                  $('#btnNextRound').prop('disabled', false);
                  $('#btnNextRound').html("Next Round");
              }
              if ($("#btnEndGame").prop("disabled")) {
                  $('#btnEndGame').prop('disabled', false);
                  $('#btnEndGame').html("See results!");
              }
            }

          } else if (data.gameState === "gameOver") {

            console.log("gameOver")

          } else {

            console.log("incorrect state")

          }

        },

        updateInRoundElements: function(data, updateCategories) {

          // Update timer
          let remainingMinutes = Math.floor(data.remainingTime / 60);
          let remainingSeconds = Math.floor(data.remainingTime % 60).toString().padStart(2, "0");
          $("#timeRemaining").html(`${remainingMinutes}:` + remainingSeconds);

          if (updateCategories) {
            // Update categories
            $("#categoryList").empty()
            for (let j = 0; j < data.categoriesPerRound; j++) {
              $("#categoryList").append("<li class = 'catLst'>".concat(data.categories[data.currentRound][j]).concat("</li>"))
            }
          }

          // Update header round number
          if (data.currentRound < 0) {
            $("#headerRoundNum").html(`Get ready for some fun!`)
          } else {
            $("#headerRoundNum").html(`Round ${data.currentRound + 1}`)
          }


          // Update letters
          $("#letter").html(data.currentLetter)

          // Update playerName
          $("#playerName").html(App.Player.myName)

          // Update players in  rooms
          $("#leaderboardList").empty()
          for (let element of IO.generateSortedLeaderboard(data)) {
            $("#leaderboardList").append("<li>".concat(element[0]).concat(` - ${element[1]}</li`))
          }

        },

        generateSortedLeaderboard: function(data) {
          let pointsArray = []
          let playerArray = []
          for (let player of data.players) {
            let roundPoints = player.points.map(x => x.reduce((a, b) => a + b, 0))
            let totalPoints = roundPoints.reduce((a, b) => a + b, 0)
            pointsArray.push(totalPoints)
            playerArray.push([player.playerName, totalPoints, roundPoints])
          }
          let result = []
          pointsArray.sort(function(a, b){return b-a})
          pointsArray.forEach(function(key) {
            var found = false;
            playerArray = playerArray.filter(function(item) {
                if(!found && item[1] == key) {
                    result.push(item);
                    found = true;
                    return false;
                } else
                    return true;
            })
          })
          return result
        },

        updateResultsPage: function(data) {
          console.log("updating results page")

          if (App.myRole === "Player" && data.showingResultsForCategoryN < data.categoriesPerRound) {

            $("#roundAnswersTable").empty()
            $("#currentRoundShower").html(`Round ${data.currentRound + 1} Results`)
            $("#roundResultsCategoryN").html(`Comparing Answers for Category ${data.showingResultsForCategoryN + 1} / ${data.categoriesPerRound}`)
            if (data.currentRound < data.rounds - 1) {
              if (data.showingResultsForCategoryN < data.categoriesPerRound - 1) {
                $("#roundResultsButtonHolder").empty()
                $("#roundResultsButtonHolder").html("<button class = 'wideBtns' id='btnNextCategory' value='word' disabled='disabled'>Waiting...</button>")
              } else {
                $("#roundResultsButtonHolder").empty()
                $("#roundResultsButtonHolder").html("<button class = 'wideBtns' id='btnNextRound' value='word' disabled='disabled'>Waiting...</button>")
              }
            } else {
              if (data.showingResultsForCategoryN < data.categoriesPerRound - 1) {
                $("#roundResultsButtonHolder").empty()
                $("#roundResultsButtonHolder").html("<button class = 'wideBtns' id='btnNextCategory' value='word' disabled='disabled'>Waiting...</button>")
              } else {
                $("#roundResultsButtonHolder").empty()
                $("#roundResultsButtonHolder").html("<button class = 'wideBtns' id='btnEndGame' value='word' disabled='disabled'>Waiting...</button>")
              }
            }

            // Populate current category.
            $("#roundAnswersTable").append('<tr id="roundAnswersCategoriesRow"></tr>')
            $("#roundAnswersCategoriesRow").append("<th class='rowTitle'>Category</td>")
            $("#roundAnswersCategoriesRow").append("<th>".concat(data.categories[data.currentRound][data.showingResultsForCategoryN]).concat("</td>"))

            // Populate point inputs.
            $("#roundAnswersTable").append('<tr id="pointInputsRow"></tr>')
            $("#pointInputsRow").append("<td class='rowTitle'>My Points</td>")
            $("#pointInputsRow").append("<td><input class='pointInput' id='myPointsInput'></input>")

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
            App.$templateGameOver = $('#game-over-template').html();

        },

        bindEvents: function () {
            App.$doc.on('click', '#btnStartTimer', IO.onStartTimer);
            App.$doc.on('click', '#btnNextCategory', IO.onNextCategory);
            App.$doc.on('click', '#btnNextRound', function() {
              IO.onNextCategory();
              setTimeout(function() {
                IO.onStartTimer();
              }, 500);
            });
            App.$doc.on('click', '#btnEndGame', function() {
              IO.onNextCategory();
              setTimeout(function() {
                  IO.socket.emit("gameOver");
                }, 500);

            })
            App.$doc.on('click', '#btnCreateGame', App.Host.onCreateClick);
            App.$doc.on('click', '#btnJoinGame', App.Player.onJoinClick);
            App.$doc.on('click', '#btnStart',App.Player.onPlayerStartClick);
            App.$doc.keyup(function(event) {
              if (event.keyCode == 13) {
                $("#btnStart").click();
              }
            })

        },

        showInitScreen: function() {
                App.$gameArea.fadeOut(fadeSpeed, function() {
                  $(this).html(App.$templateIntroScreen);
                  App.doTextFit('.title');
                }).fadeIn(fadeSpeed);

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
                App.$gameArea.fadeOut(fadeSpeed, function() {
                  $(this).html(App.$templateNewGame)
                  $('#gameURL').text(window.location.href);
                  App.doTextFit('#gameURL');
                  $('#spanNewGameCode').text(App.gameId);
                }).fadeIn(fadeSpeed)

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
            inGame: false,
            onJoinClick: function () {
                App.$gameArea.fadeOut(fadeSpeed, function() {$(this).html(App.$templateJoinGame)}).fadeIn(fadeSpeed);
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
                App.Player.inGame = true;
            },

            updateWaitingScreen : function(data) {
                if(IO.socket.id === data.playerData.mySocketId){
                    App.myRole = 'Player';
                    App.gameId = data.playerData.gameId;
                    App.$gameArea.fadeOut(fadeSpeed, function() {
                      $(this).html(App.$templateMainGame);
                      // Update categories
                      $("#categoryList").empty()
                      for (let j = 0; j < data.categoriesPerRound; j++) {
                        $("#categoryList").append("<li class = 'catLst'></li>")
                      }

                      // Update answer sheets
                      for (let round = 0; round < data.rounds; round++) {
                        $(`#answerSheet${round}`).empty()
                        for (let j = 0; j < data.categoriesPerRound; j++) {
                          $(`#answerSheet${round}`).append(`<li><input type="text" class = "ansLst" id="answerRound${round}Category${j}" disabled="disabled"></input></li>`)
                        }
                      }

                    }).fadeIn(fadeSpeed);
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
