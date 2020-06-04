var io;
var gameSocket;

var rounds = 3
var categories_per_round = 12

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

    // Host Events
    gameSocket.on('hostCreateNewGame', hostCreateNewGame);
    gameSocket.on('hostRoomFull', hostPrepareGame);
    gameSocket.on('hostCountdownFinished', hostStartGame);
    gameSocket.on('hostNextRound', hostNextRound);

    // Player Events
    gameSocket.on('playerJoinGame', playerJoinGame);
    gameSocket.on('playerAnswer', playerAnswer);
    gameSocket.on('playerRestart', playerRestart);
}

/* *******************************
   *                             *
   *       HOST FUNCTIONS        *
   *                             *
   ******************************* */

/**
 * The 'START' button was clicked and 'hostCreateNewGame' event occurred.
 */
function hostCreateNewGame() {
    // Create a unique Socket.IO Room
    var thisGameId = ( Math.random() * 10 ) | 0;

    console.log(thisGameId)

    // Return the Room ID (gameId) and the socket ID (mySocketId) to the browser client
    this.emit('newGameCreated', {gameId: thisGameId, mySocketId: this.id});

    console.log("hostCreateNewGame called with id = " + this.id)
    // Join the Room and wait for the players
    this.join(thisGameId.toString());
};

/*
 * Two players have joined. Alert the host!
 * @param gameId The game ID / room ID
 */
function hostPrepareGame(gameId) {
    var sock = this;
    var data = {
        mySocketId : sock.id,
        gameId : gameId
    };
    //console.log("All Players Present. Preparing game...");
    io.sockets.in(data.gameId).emit('beginNewGame', data);
}

/*
 * The Countdown has finished, and the game begins!
 * @param gameId The game ID / room ID
 */
function hostStartGame(gameId) {
    console.log('Game Started.');

    let n_categories = categoryList.length

    let indices = shuffle([...Array(n_categories).keys()])

    let categories = new Array(rounds)

    for (i = 0; i < rounds; i++) {
      categories[i] = new Array(categories_per_round)
      for (j = 0; j < categories_per_round; j++) {
        categories[i][j] = categoryList[indices[i * j + j]].toLowerCase()
      }
    }

    for (i = 0; i < rounds; i++) {
      console.log("ROUND" + i)
      for (j = 0; j < categories_per_round; j++) {
        console.log(categories[i][j])
      }
    }

    sendWord(0,gameId);
};

/**
 * A player answered correctly. Time for the next word.
 * @param data Sent from the client. Contains the current round and gameId (room)
 */
function hostNextRound(data) {
    if(data.round < wordPool.length ){
        // Send a new set of words back to the host and players.
        sendWord(data.round, data.gameId);
    } else {
        // If the current round exceeds the number of words, send the 'gameOver' event.
        io.sockets.in(data.gameId).emit('gameOver',data);
    }
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

        //console.log('Player ' + data.playerName + ' joining game: ' + data.gameId );

        // Emit an event notifying the clients that the player has joined the room.
        io.sockets.in(data.gameId).emit('playerJoinedRoom', data);

    } else {
        // Otherwise, send an error message back to the player.
        this.emit('error',{message: "This room does not exist."} );
    }
}

/**
 * A player has tapped a word in the word list.
 * @param data gameId
 */
function playerAnswer(data) {
    console.log('Player ID: ' + data.playerId + ' answered a question with: ' + data.answer);

    // The player's answer is attached to the data object.  \
    // Emit an event with the answer so it can be checked by the 'Host'
    io.sockets.in(data.gameId).emit('hostCheckAnswer', data);
}

/**
 * The game is over, and a player has clicked a button to restart the game.
 * @param data
 */
function playerRestart(data) {
    console.log('Player: ' + data.playerName + ' ready for new game.');

    // Emit the player's data back to the clients in the game room.
    data.playerId = this.id;
    io.sockets.in(data.gameId).emit('playerJoinedRoom',data);
}

/* *************************
   *                       *
   *      GAME LOGIC       *
   *                       *
   ************************* */

/**
 * Get a word for the host, and a list of words for the player.
 *
 * @param wordPoolIndex
 * @param gameId The room identifier
 */
function sendWord(wordPoolIndex, gameId) {
    var data = getWordData(wordPoolIndex);
    io.sockets.in(gameId).emit('newWordData', data);
}

/**
 * This function does all the work of getting a new words from the pile
 * and organizing the data to be sent back to the clients.
 *
 * @param i The index of the wordPool.
 * @returns {{round: *, word: *, answer: *, list: Array}}
 */
function getWordData(i){
    // Randomize the order of the available words.
    // The first element in the randomized array will be displayed on the host screen.
    // The second element will be hidden in a list of decoys as the correct answer
    var words = shuffle(wordPool[i].words);

    // Randomize the order of the decoy words and choose the first 5
    var decoys = shuffle(wordPool[i].decoys).slice(0,5);

    // Pick a random spot in the decoy list to put the correct answer
    var rnd = Math.floor(Math.random() * 5);
    decoys.splice(rnd, 0, words[1]);

    // Package the words into a single object.
    var wordData = {
        round: i,
        word : words[0],   // Displayed Word
        answer : words[1], // Correct Answer
        list : decoys      // Word list for player (decoys and answer)
    };

    return wordData;
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

/**
 * Each element in the array provides data for a single round in the game.
 *
 * In each round, two random "words" are chosen as the host word and the correct answer.
 * Five random "decoys" are chosen to make up the list displayed to the player.
 * The correct answer is randomly inserted into the list of chosen decoys.
 *
 * @type {Array}
 */
var wordPool = [
    {
        "words"  : [ "sale","seal","ales","leas" ],
        "decoys" : [ "lead","lamp","seed","eels","lean","cels","lyse","sloe","tels","self" ]
    },

    {
        "words"  : [ "item","time","mite","emit" ],
        "decoys" : [ "neat","team","omit","tame","mate","idem","mile","lime","tire","exit" ]
    },

    {
        "words"  : [ "spat","past","pats","taps" ],
        "decoys" : [ "pots","laps","step","lets","pint","atop","tapa","rapt","swap","yaps" ]
    },

    {
        "words"  : [ "nest","sent","nets","tens" ],
        "decoys" : [ "tend","went","lent","teen","neat","ante","tone","newt","vent","elan" ]
    },

    {
        "words"  : [ "pale","leap","plea","peal" ],
        "decoys" : [ "sale","pail","play","lips","slip","pile","pleb","pled","help","lope" ]
    },

    {
        "words"  : [ "races","cares","scare","acres" ],
        "decoys" : [ "crass","scary","seeds","score","screw","cager","clear","recap","trace","cadre" ]
    },

    {
        "words"  : [ "bowel","elbow","below","beowl" ],
        "decoys" : [ "bowed","bower","robed","probe","roble","bowls","blows","brawl","bylaw","ebola" ]
    },

    {
        "words"  : [ "dates","stead","sated","adset" ],
        "decoys" : [ "seats","diety","seeds","today","sited","dotes","tides","duets","deist","diets" ]
    },

    {
        "words"  : [ "spear","parse","reaps","pares" ],
        "decoys" : [ "ramps","tarps","strep","spore","repos","peris","strap","perms","ropes","super" ]
    },

    {
        "words"  : [ "stone","tones","steno","onset" ],
        "decoys" : [ "snout","tongs","stent","tense","terns","santo","stony","toons","snort","stint" ]
    }
]

var categoryList = [
  'A boy’s name',
  'A river',
  'An animal',
  'Things that are cold',
  'Insects',
  'TV Shows',
  'Things that grow',
  'Fruits',
  'Things that are black',
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
  'In the NWT (Northwest Territories, Canada)',
  'Clothing',
  'A relative',
  'Games',
  'Sports Stars',
  'School supplies',
  'Things that are hot',
  'Heroes',
  'A girl’s name',
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
  'Nicknames',
  'Hobbies',
  'Parts of the body',
  'Sandwiches',
  'Items in a catalog',
  'World leaders/Poloticians',
  'School subjects',
  'Excuses for being late',
  'Ice cream flavors',
  'Things that jump/bounce',
  'Television stars',
  'Things in a park',
  'Foriegn cities',
  'Stones/Gems',
  'Musical instruments',
  'Nicknames',
  'Things in the sky',
  'Pizza toppings',
  'Colleges/Universities',
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
  'Footware',
  'Something you keep hidden',
  'Items in a suitcase',
  'Things with tails',
  'Sports equiptment',
  'Crimes',
  'Things that are sticky',
  'Awards/ceremonies',
  'Cars',
  'Spices/Herbs',
  'Bad habits',
  'Cosmetics/Toiletries',
  'Celebrities',
  'Cooking utensils',
  'Reptiles/Amphibians',
  'Parks',
  'Leisure activities',
  'Things people are allergic to',
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
  'Words associated with exercise',
  'Sports',
  'Song titles',
  'Parts of the body',
  'Ethnic foods',
  'Things you shout',
  'Birds',
  'A girl’s name',
  'Ways to get from here to there',
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
  'Food/Drink that is green',
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
  'Animals in books or movies',
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
  'Types off candy',
  'Accessories',
  'Things used by the handicapped',
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
  'Figures from history',
  'Types of drugs',
  'Types of bread',
  'Fictional characters',
  'Items on a lunch menu',
  'Magazines',
  'State capitals',
  'Things with tails',
  'Crimes',
  'Vanilla items',
  'Types of popcorn',
  'Large ticket items',
  "Items in Grandma's kitchen",
  'Dog toys',
  'Items found in the backyard',
  'Sticky things',
  'Awards',
  'Types of vehicles',
  'Herbs',
  'Cosmetics',
  'Utensils for cooking',
  'Bad habits',
  'Scandals',
  'Reptiles',
  'Leisure activities',
  'Monthly expenses',
  'Things found at a construction site',
  "Old-fashioned boy's name",
  'Items that are frozen',
  'Television shows from 2000',
  'Rivers',
  'Vegetables',
  'Things that are yellow',
  'Trees',
  'Marching band instruments',
  'College subjects',
  'Dishes made from pasta',
  'Books about animals',
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
  'Things found in space',
]
