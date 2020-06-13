var io;
var gameSocket;

// Game constants.
var rounds = 1;
var categoriesPerRound = 1;
var roundTime = 5;
var categories = new Array(rounds)
for (i = 0; i < rounds; i++) {
  categories[i] = new Array(categoriesPerRound)
  for (j = 0; j < categoriesPerRound; j++) {
    categories[i][j] = ""
  }
}

// Global game variables.
var gameState = "pregame"
var currentRound = -1
var currentLetter = ""
var remainingTime = JSON.parse(JSON.stringify(roundTime));
var frequentUpdateTimer;
var players = []
var showingResultsForCategoryN = 0

/**
 * This function is called by index.js to initialize a new game instance.
 *
 * @param sio The Socket.IO library
 * @param socket The socket object for the connected client.
 */
exports.initGame = function(sio, socket){
    io = sio;
    gameSocket = socket;
    gameSocket.emit('connected', { message: "You are connected!" });
    sio.sockets.emit("initGame", {
      categoriesPerRound: categoriesPerRound,
      rounds: rounds
    })

    gameSocket.on('startTimer', startTimer)
    gameSocket.on('nextCategoryButtonClicked', nextCategory)
    gameSocket.on('hostCreateNewGame', hostCreateNewGame);
    gameSocket.on('playerJoinGame', playerJoinGame);
    gameSocket.on('collectedPlayerResponses', collectedPlayerResponses)
    gameSocket.on('collectedPlayerPoints', collectedPlayerPoints)
    gameSocket.on('gameOver', gameOver)
    gameSocket.on("updateRoundResultsStatus", updateRoundResultsStatus)

    // Update loop
    if (!frequentUpdateTimer) {
      frequentUpdateTimer = setInterval(frequentUpdate, 250)
      function frequentUpdate() {

        // If the game has started, count down
        if (gameState === "inRound") {
          if (remainingTime > 0) {
            remainingTime -= 0.25
          } else {
            sio.sockets.emit("roundOver", {
              currentRound: currentRound,
              categories: categories,
              showingResultsForCategoryN: showingResultsForCategoryN,
              players: players,
              categoriesPerRound: categoriesPerRound
            })
            setTimeout(function() {sio.sockets.emit("updatedPlayerResponses", {currentRound: currentRound, categories: categories, showingResultsForCategoryN: showingResultsForCategoryN, players: players, categoriesPerRound: categoriesPerRound, rounds: rounds})}, 500);
          }
        } else if (gameState === "gameOver") {
          io.sockets.emit("populateFinalLeaderboard", {players: players, rounds: rounds})
          gameState = "finalLeaderboardShowing"
        }

        // Update clients with latest game state.
        sio.sockets.emit('frequentUpdate', {
          remainingTime: remainingTime,
          categories: categories,
          rounds: rounds,
          currentRound: currentRound,
          categoriesPerRound: categoriesPerRound,
          gameState: gameState,
          currentLetter: currentLetter,
          players: players,
          showingResultsForCategoryN: showingResultsForCategoryN
        }
      );
      return;
    }
  }
}

function startTimer() {

  // Start timer
  gameState = "inRound"
  remainingTime = JSON.parse(JSON.stringify(roundTime));
  currentRound += 1
  showingResultsForCategoryN = 0


  // Generate categories
  let n_categories = categoryList.length
  let indices = shuffle([...Array(n_categories).keys()])
  for (let i = 0; i < rounds; i++) {
    for (let j = 0; j < categoriesPerRound; j++) {
      categories[i][j] = categoryList[indices[i * j + j]].toLowerCase()
    }
  }

  // Pick letter
  currentLetter = letterList[Math.floor(Math.random() * letterList.length)]

  io.sockets.emit("timerStarted", {rounds: rounds, categoriesPerRound: categoriesPerRound, currentRound: currentRound})

}

function nextCategory(data) {

  io.sockets.emit("collectPlayerPoints")

  setTimeout(function() {
    showingResultsForCategoryN += 1
    for (player of players) {
      player.answerEntered = false
    }
    console.log("players non-answered")
    io.sockets.emit("updatedNextCategory", {currentRound: currentRound, categories: categories, showingResultsForCategoryN: showingResultsForCategoryN, players: players, categoriesPerRound: categoriesPerRound, rounds: rounds, players: players})
  }, 250)


}

function collectedPlayerPoints(data) {
  let player = players.filter(obj => {return obj.playerName == data.playerName})[0]
  player.points[currentRound][showingResultsForCategoryN] = data.myPoints
}

function updateRoundResultsStatus(data) {
  let player = players.filter(obj => {return obj.playerName == data.playerName})[0]
  player.answerEntered = data.answerEntered
}

function hostCreateNewGame() {
    // Create a unique Socket.IO Room
    var thisGameId = 0

    // Return the Room ID (gameId) and the socket ID (mySocketId) to the browser client
    this.emit('newGameCreated', {gameId: thisGameId, mySocketId: this.id});

    // Join the Room and wait for the players
    this.join(thisGameId.toString());
};

function gameOver() {
  gameState = "gameOver"
}

/* *****************************
   *                           *
   *     PLAYER FUNCTIONS      *
   *                           *
   ***************************** */

/**
 * A player clicked the 'START GAME' button.
 * Attempt to connect them to the room that matches
 * the gameId entered by the player.
 * @param data Contains data entered via player's input - playerName and gameId.
 */
function playerJoinGame(data) {
    console.log('Player ' + data.playerName + ' attempting to join game: ' + data.gameId );

    // A reference to the player's Socket.IO socket object
    var sock = this;

    console.log(gameSocket.adapter.rooms)

    // Look up the room ID in the Socket.IO manager object.
    var room = gameSocket.adapter.rooms[data.gameId];

    // If the room exists...
    if( room != undefined ){
        // attach the socket id to the data object.
        data.mySocketId = sock.id;

        // Join the room
        sock.join(data.gameId);

        // Populate empty player answers.
        data.answers = new Array(rounds)
        data.points = new Array(rounds)
        for (i = 0; i < rounds; i++) {
          data.answers[i] = new Array(categoriesPerRound)
          data.points[i] = new Array(categoriesPerRound)
          for (j = 0; j < categoriesPerRound; j++) {
            data.answers[i][j] = ""
            data.points[i][j] = 0
          }
        }

        data.answerEntered = false

        players.push(data)

        // Emit an event notifying the clients that the player has joined the room.
        io.sockets.in(data.gameId).emit('playerJoinedRoom', {playerData: data, rounds: rounds, categoriesPerRound: categoriesPerRound});

    } else {
        // Otherwise, send an error message back to the player.
    }
}

function collectedPlayerResponses(data) {

  let player = players.filter(obj => {return obj.playerName == data.playerName})[0]
  player.answers[data.currentRound] = data.playerAnswers
  gameState = "showResults"
}

/*
 * Javascript implementation of Fisher-Yates shuffle algorithm
 * http://stackoverflow.com/questions/2450954/how-to-randomize-a-javascript-array
 */
function shuffle(array) {
    var currentIndex = array.length;
    var temporaryValue;
    var randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {

        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        // And swap it with the current element.
        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }

    return array;
}

var categoryList = [
  'A river',
  'An animal',
  'Things that are cold',
  'Insects',
  'TV Shows',
  'Things that grow',
  'Fruits',
  'Things that are blue',
  'School subjects',
  'Movie titles',
  'Musical Instruments',
  'Authors',
  'Bodies of water',
  'A bird',
  'Countries',
  'Cartoon characters',
  'Holidays',
  'Things that are square',
  'Things in Alaska',
  'Clothing',
  'Games',
  'Sports Stars',
  'School supplies',
  'Things that are hot',
  'Heroes',
  'Fears',
  'TV Stars',
  'Colors',
  'A fish',
  'Fruits',
  'Provinces or States',
  'Sports equipment',
  'Tools',
  'Breakfast foods',
  'Gifts',
  'Flowers',
  'Ice cream flavors',
  'A drink',
  'Toys',
  'Cities',
  'Things in the kitchen',
  'Ocean things',
  'Hobbies',
  'Parts of the body',
  'Sandwiches',
  'Items in a catalog',
  'World leaders',
  'School subjects',
  'Excuses for being late',
  'Ice cream flavors',
  'Things that jump/bounce',
  'Television stars',
  'Things in a park',
  'Foriegn cities',
  'Gems',
  'Musical instruments',
  'Nicknames',
  'Things in the sky',
  'Pizza toppings',
  'Colleges',
  'Fish',
  'Countries',
  'Things that have spots',
  'Historical Figures',
  'Something you’re afraid of',
  'Terms of endearment',
  'Items in this room',
  'Drugs that are abused',
  'Fictional characters',
  'Menu items',
  'Magazines',
  'Capitals',
  'Kinds of candy',
  'Items you save up to buy',
  'Footwear',
  'Something you keep hidden',
  'Items in a suitcase',
  'Things with tails',
  'Sports equiptment',
  'Crimes',
  'Things that are sticky',
  'Awards',
  'Cars',
  'Spices and herbs',
  'Bad habits',
  'Cosmetics or toiletries',
  'Celebrities',
  'Cooking utensils',
  'Reptiles',
  'Parks',
  'Leisure activities',
  'Allergies',
  'Restaurants',
  'Notorious people',
  'Fruits',
  'Things in a medicine cabinet',
  'Toys',
  'Household chores',
  'Bodies of water',
  'Authors',
  'Halloween costumes',
  'Weapons',
  'Things that are round',
  'Exercise-related words',
  'Sports',
  'Song titles',
  'Parts of the body',
  'Global foods',
  'Things you shout',
  'Birds',
  'Ways to get somewhere',
  'Items in a kitchen',
  'Villains',
  'Flowers',
  'Things you replace',
  'Baby foods',
  'Famous duos and trios',
  'Things found in a desk',
  'Vacation spots',
  'Diseases',
  'Words associated with money',
  'Items in a vending machine',
  'Movie Titles',
  'Games',
  'Things you wear',
  'Beers',
  'Things at a circus',
  'Vegetables',
  'States',
  'Things you throw away',
  'Occupations',
  'Appliances',
  'Cartoon characters',
  'Types of drinks',
  'Musical groups',
  'Store names',
  'Things at a football game',
  'Trees',
  'Personality traits',
  'Video games',
  'Electronic gadgets',
  'Board games',
  'Things that use a remote',
  'Card games',
  'Internet lingo',
  'Wireless things',
  'Computer parts',
  'Software',
  'Websites',
  'Game terms',
  'Things in a grocery store',
  'Reasons to quit your job',
  'Things that have stripes',
  'Tourist attractions',
  'Diet foods',
  'Things found in a hospital',
  'Weekend Activities',
  'Acronyms',
  'Seafood',
  'Christmas songs',
  'Words ending in “-n”',
  'Words with double letters',
  'Children’s books',
  'Things found at a bar',
  'Sports played outdoors',
  'Names used in songs',
  'Foods you eat raw',
  'Places in Europe',
  'Olympic events',
  'Things you see at the zoo',
  'Math terms',
  'Things to do at a party',
  'Kinds of soup',
  'Things found in New York',
  'Things you get tickets for',
  'Things you do at work',
  'Foreign words used in English',
  'Things you shouldn’t touch',
  'Spicy foods',
  'Things at a carnival',
  'Things you make',
  'Places to hangout',
  'Animal noises',
  'Computer programs',
  'Honeymoon spots',
  'Things you buy for kids',
  'Things that can kill you',
  'Reasons to take out a loan',
  'Words associated with winter',
  'Things to do on a date',
  'Historic events',
  'Things you store items in',
  'Things you do everyday',
  'Things you get in the mail',
  'Things you save up to buy',
  'Things you sit on',
  'Reasons to make a phone call',
  'Types of weather',
  'Titles people can have',
  'Things that have buttons',
  'Items you take on a road trip',
  'Things that have wheels',
  'Reasons to call 911',
  'Things that make you smile',
  'Ways to kill time',
  'Things that can get you fired',
  'Hobbies',
  'Holiday Activities',
  'States',
  'Tools',
  'Things found in a cafeteria',
  'Things found on a farm',
  'Fears',
  'Sweet things',
  'Dental procedures',
  'Perfumes',
  'Types of candy',
  'Accessories',
  'Sounds animals make',
  'Things that are hot',
  'Breakfast foods',
  'Graduation gifts',
  'Types of drinks',
  'Things found in the ocean',
  'Hobbies',
  'Child actresses',
  'Types of cheese',
  'Types of transportation',
  'Reasons to be late',
  'Professions',
  'Things that are cold',
  'Toppings for pizza',
  'Colleges',
  'Things with spots',
  'Things from the Civil War',
  'Items in a dresser drawer',
  'Ways to relax',
  'Things found in the sky',
  'Types of drugs',
  'Types of bread',
  'Fictional characters',
  'Items on a lunch menu',
  'Magazines',
  'Things with tails',
  'Crimes',
  'Large ticket items',
  "Items in Grandma's kitchen",
  'Dog toys',
  'Items found in the backyard',
  'Sticky things',
  'Awards',
  'Types of vehicles',
  'Cosmetics',
  'Utensils for cooking',
  'Bad habits',
  'Scandals',
  'Reptiles',
  'Leisure activities',
  'Monthly expenses',
  'Things on a construction site',
  "Old-fashioned boy's name",
  'Items that are frozen',
  'Television shows from 2000',
  'Rivers',
  'Vegetables',
  'Things that are yellow',
  'Trees',
  'Marching band instruments',
  'College subjects',
  'Insects',
  'Types of sports',
  'Poems',
  'Parts of the human body',
  "Old fashioned girl's name",
  'Global foods',
  'Types of transportation',
  'School supplies',
  'Items found in a library',
  'Types of birds',
  'Flowers',
  'Types of shoes',
  'Halloween costumes',
  'Foods found in a submarine',
  'Politicians',
  'Flavors of ice cream',
  'Reasons a child is grounded',
  'Television actors',
  'Semi-precious gemstones',
  'Country foods',
  'Types of balls',
  'Animals in zoos',
  'Things in the circus',
  'Things found in a park',
  'Types of cats',
  'Book authors',
  'Countries',
  'Things that are round',
  'Types of clothing',
  'Games played at recess',
  'Mammals',
  'Countries',
  'Types of relatives',
  'Holidays around the world',
  'Fruits',
  'Things found in a forest',
  'Colors',
  'Sports stars',
  'Restaurants',
  'Villains',
  'Toys',
  'Weapons',
  'Things that are square',
  'Things used by a bodybuilder',
  'Things in the bathroom',
  'Types of exercises',
  'Desserts',
  'Newspapers',
  'Things found in space'
];

var letterList = [
  'A',	'B',	'C',	'D',	'E',	'F',	'G',	'H',	'I',	'J',	'K',	'L',	'M',	'N',	'O',	'P',	'R',	'S',	'T','W',
];
