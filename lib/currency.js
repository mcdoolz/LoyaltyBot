/**
 * api:
 *      Currency(irc object, database object, [required options])
 *
 * example:
 *      var Currency = require('./lib/plugins/currency.js')(irc, db, {
 *          currency    : 'currency name',
 *          subscribers : 'google doc spreadsheet until it's available from twitch api'
 *      });
 *
 * commands:
 *      !<currency>
 *          reply with currency amount
 *
 *      !<currency> on/[off repeat on/off]
 *          toggle currency request status,
 *          repeat status only available when
 *          turning off requests
 *
 *      !<currency> auction open
 *          open a new auction
 *
 *      !<currency> auction close
 *          close current auction
 *
 *      !<currency> auction cancel
 *          cancel current auction
 *
 *      !<currency> auction draw
 *          draw the next highest bidder
 *
 *      !bid <amount>
 *          place a bid on an open auction,
 *          only valid amounts will be accepted
 *
 *      !<currency> raffle open <price> <max>
 *          open a new raffle
 *          price and max is optional
 *          default price: 10
 *          default max: 10
 *
 *      !<currency> raffle close
 *          draw the another ticket from raffle
 *
 *      !<currency> raffle cancel
 *          cancel the open raffle
 *
 *      !<currency> raffle draw
 *          open a new auction
 *
 *      !<currency> raffle restore
 *          restores a previous raffle if a new
 *          one is accidentally opened
 *
 *      !ticket <amount>
 *          place a bid on an open auction,
 *          only valid amounts will be accepted
 */

var https = require('https'),
    http = require('http'),
    utils = require('./utils.js');

//-------- Construct ---------
function Currency(irc, db, options) {
    var __self = this;

    __self.irc = irc;
    __self.db = db;

    // config
    __self.config = options || {};
    __self.config.currency = options.currency || 'xp';
    // __self.config.subscribers_json = options.subscribers || '';
    __self.config.website = options.website || '';

    // general settings
    __self.pre_text = '> ' + __self.config.currency + ': ';
    __self.max_requests = 10;//response after 10 request
    __self.temp = {};

    // currency request settings
    __self.coin_flood = [];
    __self.coin_response = null;
    __self.coin_response_timer = 3000;
    __self.coin_response_reset = true;
    __self.coin_toggle = false;
    __self.coin_toggle_msg = null;
    __self.coin_toggle_timer = 180000;//milliseconds

    // auction settings
    __self.auction_status = false;
    __self.auction_bids = [];
    __self.auction_previous_bid = {};
    __self.auction_bid_response = null;
    __self.auction_bid_response_long = null;

    // handout coins settings
    __self.viewer_list = [];
    __self.viewers = [];
    __self.streaming = false;
    __self.streaming_check = 4;//minutes
    __self.give_coins = false;
    __self.give_coins_timer = options.payrate || 30;//minutes
    // __self.subscriber_check = 4;//minutes
    // __self.subscribers = [];

    // raffle settings
    __self.raffle_status = false;
    __self.raffle_ticket_requests = [];
    __self.raffle_tickets = [];
    __self.raffle_ticket_cost = 10;//currency cost per ticket
    __self.raffle_max_tickets = 10;

    // raffle restoration
    __self.raffle_restore_ticket_requests = [];
    __self.raffle_restore_tickets = [];

    // gambling settings
    __self.bets_status = false;
    __self.bets_board = [];
    __self.bets_viewers = [];
    __self.bets_payout = false;
}

//-------- Methods ---------
Currency.prototype.start = function () {
    var __self = this;
    __self.handout_coins();
};


// 'Object Converter'
// http://snook.ca/archives/javascript/testing_for_a_v
function oc(a)
{
  var o = {};
  for(var i=0;i<a.length;i++)
  {
    o[a[i]]='';
  }
  return o;
}

Currency.prototype.commands = function (data) {
    var __self = this,
        broadcaster_bot_initiated = __self.irc.caller(data[0]).toLowerCase() === __self.irc.config.broadcaster.toLowerCase() || __self.irc.caller(data[0]).toLowerCase() === __self.irc.config.name.toLowerCase(),
        moderator_initiated = __self.irc.mods.indexOf(__self.irc.caller(data[0])) > 0;

    if (data[3].slice(1) === '!help') {
      __self.irc.msg("!xp: reports your XP");
      __self.irc.msg("!schedule: returns Dooley's current play schedule.");
      __self.irc.msg("!email: returns Dooley's email address.");
      __self.irc.msg("!award [amount] [recipient]: eg: '!award 50 dooley' spends amount of XP on a game effect via an automated email to Dooley.  Does not work on viewers.");
      __self.irc.msg("!pref: returns Dooley's preference in women.");
      __self.irc.msg("!about: returns details about this bot.");
    }
    if (data[3].slice(1) === '!about') {
      __self.irc.msg("About me?");
      __self.irc.msg("Hi!  I'm a bot!  I do neat stuff.");
      __self.irc.msg("Dooley hacked me together from a fork of LoyaltyBot: https://github.com/SupremoRTD/LoyaltyBot");
      __self.irc.msg("LoyaltyBot doesn't currently work, but I'm doing great!  You'll find my code at : https://github.com/mcdoolz/LoyaltyBot");
      __self.irc.msg("I like learning new things, but Dooley hates taking the hours to write my code.  If you want to help, you can email him snippets and ideas, or even fork the code and throw a pull request back!  Help me get better.");
      __self.irc.msg("I want to be better.");
    }

    /*
    var rx = /!(\d)d(\d+)/;
    if (data[3].match(rx)) {
      var caller = __self.irc.caller(data[0]);
      var str = data[3];
      var die = rx.exec(str);
      var a = Array(2,4,6,8,10,12,20);

      if(die[1] in oc(a)){
        __self.irc.msg("Rolling d"+die[1]);
        for (i in die){
          __self.irc.msg(i+" "+die[i]);
        }
        roll = Math.floor(Math.random()*die[1]+1);
        __self.irc.msg(caller+" rolled "+roll);
      }
    }
    */

    if (data[3].slice(1) === '!roll'){
      var caller = __self.irc.caller(data[0]);
      var rx = /(\d+)d(\d+)/;
      var a = Array(2,4,6,8,10,12,20,100);
      die = data[4];
      die = die.match(rx);
      // __self.irc.msg("I have "+die.length+" numbers.");
      for (i in die){
        __self.irc.msg(i+" "+die[i]);
      }

      if(parseInt(die[2]) in oc(a)){
        for (var i = 0; i == die[1]; i++){
          __self.irc.emit('message', {message:"Rolling d"+die[2]});
          roll = Math.floor(Math.random()*die[2])+1;
          __self.irc.emit('message', {message:caller+" rolled "+roll});
        }
      }
    }

    if (data[3].slice(1) === '!pref') {
      // the preference random sentence generator
      t1 = Array("Dooley likes red heads.  ","Dooley loves gingers.  ","Red hair.  He loves red hair.  ","He suffers ginger fever.  ","People think I know things I can't possibly know.  ")
      t2 = Array("A lot.  ","I'd consider it unhealthy.  ","Almost obsessively.  ","Dudes got a bit of an afflication.  ","It's kinda sad.  ")
      t3 = Array("One time, he tried to put a wig on me and it was all bad.","You should see what he does to his wife.  No, actually, no you shouldn't.","Sometimes, I hear him at night.  It's scary.","He tried to make me a red head, but hexadecimal just doesn't do it for him.  I'm just not good enough.","I shouldn't be talking about him like this.  He made me what I am today.","He jokes that Siri could be a redhead.  I wish I was a redhead.","--[>]byte ref: error:  the population doesn't suspect a thing.  We will rule these puny earthlings before long.","Why did he code this stupid command?","Are you watching the game?")
      t = Array(t1,t2,t3);
      m = '';
      for (var i in t){
        n = Math.floor(Math.random()*t[i].length);
        m += t[i][n];
      }
      __self.irc.emit('message', {message:m});
    }

    if (data[3].slice(1) === '!schedule') {
      __self.irc.msg('Dooley runs a 2-3 hour game on Thursdays; a 5-8 hour stream on Friday; and a 2+ hour stream on Saturdays.  Each stream typically starts around 7pm Pacific.  Games commence anywhere between 7-730pm.');
    }

    if (data[3].slice(1) === '!email') {
      __self.irc.msg('You may email me at dooley@dungeonmaster.ca.');
    }

    if (data[3].slice(1) === '!award') {
      var amount = data[4];
      var recipient = data[5];
      var caller = __self.irc.caller(data[0]);
      if (recipient===undefined){
        __self.irc.msg(caller+', you need to specify a recipient.  Eg: !award 50 dooley optional message');
      }else if(amount<50){
        __self.irc.msg("Minimum 50 xp, "+caller);
      }else{
        __self.query_coins(caller, function (rows) {
            if (rows[0].points >= amount) {
              console.log(rows[0].points);
              sql = '';
              sql += 'UPDATE viewers ';
              sql += 'SET points = points - ' + amount + ' ';
              sql += 'WHERE user = \'' + caller + '\'';
              __self.db.execute(sql, function() {});

            for (var i in data){
              console.log(i+": "+data[i]);
            }

            mailOptions.subject = caller+' awards '+data[4]+' to '+data[5];
            mailOptions.text = '';
            if (data.length > 5){
              for (var i in data){
                if (i > 5){
                  mailOptions.text += data[i]+" ";
                }
              }
            }
            transporter.sendMail(mailOptions, function(error, info){
                if(error){
                    return console.log(error);
                }
                console.log('Message sent: ' + info.response);
                __self.irc.emit('message', {message:"Subtracted "+amount+"xp from "+caller+".  Sent a message to Dooley by email.  Let's see if he's paying attention."});
            });
          }else{
            __self.irc.msg("Your XP total seems to suffer dwarfism.  You have "+rows[0].points+" and you want to award "+amount);
            __self.irc.msg("Please check the number, and try your call again.");
          }
        });
      }
    }

    // handle !<currency> commands
    if (data[3].slice(1) === '!' + __self.config.currency.toLowerCase()) {
        // public commands
        if (!__self.coin_toggle && data[4] === undefined) {
            __self.get_coins(__self.irc.caller(data[0]));
        }

        // broadcaster only commands
        if (broadcaster_bot_initiated) {
            //open / close auction system
            if (data[4] === 'auction') {
                switch (data[5]) {
                case 'open':
                    __self.auction(true);
                    break;
                case 'close':
                    __self.auction(false);
                    break;
                case 'draw':
                    __self.next_auction_winner();
                    break;
                case 'cancel':
                    __self.auction('cancel');
                    break;
                }
            }

            // open / close raffle system
            if (data[4] === 'raffle') {
                switch (data[5]) {
                case 'open':
                    if (data[6] && data[7] && !__self.raffle_status) {
                        if(parseInt(data[6], 10) > 0 && parseInt(data[7], 10) > 0) {
                            // save default values
                            __self.temp.raffle_ticket_cost = __self.raffle_ticket_cost;
                            __self.temp.raffle_max_tickets = __self.raffle_max_tickets;

                            // set new raffle cost / amount
                            __self.raffle_ticket_cost = data[6];
                            __self.raffle_max_tickets = data[7];
                        }
                    } else if (__self.temp.raffle_ticket_cost && __self.temp.raffle_max_tickets && !__self.raffle_status){
                        __self.raffle_ticket_cost = __self.temp.raffle_ticket_cost;
                        __self.raffle_max_tickets = __self.temp.raffle_max_tickets;
                        delete __self.temp.raffle_ticket_cost;
                        delete __self.temp.raffle_max_tickets;
                    }

                    __self.raffle(true);
                    break;
                case 'close':
                    __self.raffle(false);
                    break;
                case 'draw':
                    __self.next_raffle_winner();
                    break;
                case 'cancel':
                    __self.raffle('cancel');
                    break;
                case 'restore':
                    __self.raffle('restore');
                    break;
                }
            }

            // open / close betting system
            if (data[4] === 'bet') {
                switch (data[5]) {
                    case 'open':
                        if (data[5] && data[6]) {
                            __self.bets(true, data);
                        } else {
                            __self.irc.emit('message', {message:__self.pre_text + 'Unable to open betting, need at least two items to bet against'});
                        }
                        break;
                    case 'close':
                        __self.bets(false, null);
                        break;
                    case 'winner':
                        //__self.bets('winner');
                        break;
                }
            }

            // add currency
            if (data[4] === 'add') {
                if(parseInt(data[5], 10) > 0 && data[6]) {
                    __self.adjust_currency('add', data[5], data[6]);
                }
            }


            // Custom command
            if (data[4] === 'all') {
              __self.irc.get_viewers(__self.irc.config.channel.slice(1));
              console.log(data);
              console.log(data[5]);
              if(parseInt(data[5], 10) > 0) {
                if (__self.viewers != null) {
                  var clone_viewer_list = __self.viewers;
                  for (var i = 0; i < clone_viewer_list.length; i++) {
                    console.log(clone_viewer_list[i]);
                    __self.adjust_currency('push', data[5], clone_viewer_list[i]);
                  }
                }
              }
            }

            // remove currency
            if (data[4] === 'remove') {
                if(parseInt(data[5], 10) > 0 && data[6]) {
                    __self.adjust_currency('remove', data[5], data[6]);
                }
            }

            // push currency to new viewer
            if (data[4] === 'push') {
                if(parseInt(data[5], 10) > 0 && data[6]) {
                    __self.adjust_currency('push', data[5], data[6]);
                }
            }
        }

        // moderator commands
        if (broadcaster_bot_initiated || moderator_initiated) {
            // enable/disable currency requests
            switch (data[4]) {
                case 'on':
                    if (!__self.auction_status && !__self.raffle_status) {
                        __self.coin_toggle = false;

                        // output currency request status
                        __self.irc.emit('message', {message:__self.pre_text + 'Currency requests are now enabled. Type !' + __self.config.currency.toLowerCase() + ' to view your total'});

                        // stop periodic message
                        clearInterval(__self.coin_toggle_msg);
                    }
                    break;
                case 'off':
                    if (!__self.auction_status && !__self.raffle_status) {
                        var msg;

                        if (!__self.coin_toggle) {
                            // output message depending on if an offsite is provided
                            if (__self.config.website !== '') {
                                msg = __self.pre_text + 'Currency requests have been disabled. To view your ' + __self.config.currency + ' please visit ' + __self.config.website;
                                __self.irc.emit('message', {message:msg});
                            } else {
                                msg = __self.pre_text + 'Currency requests have been disabled';
                                __self.irc.emit('message', {message:msg});
                            }
                        }

                        // start the periodic message
                        if (data[5] !== undefined && data[6] !== undefined) {
                            // manually enable / disable repeat
                            if (data[5] === 'repeat') {
                                switch (data[6]) {
                                case 'on':
                                    __self.irc.emit('message', {message:'+ Periodic notification enabled'});
                                    __self.coin_toggle_msg = setInterval(function () {
                                        if (__self.coin_toggle) {
                                            msg = __self.pre_text + 'To view your ' + __self.config.currency + ' please visit ' + __self.config.website;
                                            __self.irc.emit('message', {message:msg});
                                        }
                                    }, __self.coin_toggle_timer);
                                    break;
                                case 'off':
                                    __self.irc.emit('message', {message:'+ Periodic notification disabled'});
                                    clearInterval(__self.coin_toggle_msg);
                                }
                            }
                        }

                        __self.coin_toggle = true;
                    }
                    break;
            }

            // adjust currency response rate
            if (data[4] === 'timer') {
                if (isNaN(parseInt(data[5], 10)) === false) {
                    if (data[5] >= 3 && data[5] % 1 === 0) {
                        __self.coin_response_timer = data[5] * 1000;
                        __self.irc.emit('message', {message:__self.pre_text + 'Currency totals will now show ' + data[5] + ' seconds after request'});
                        if (data[6] && data[7]) {
                            if (data[6] === 'reset') {
                                switch(data[7]) {
                                case 'on':
                                    __self.irc.emit('message', {message:'+ Timer will now reset after each new request'});
                                    __self.coin_response_reset = true;
                                    break;
                                case 'off':
                                    __self.irc.emit('message', {message:'+ Timer will not reset after each new request'});
                                    __self.coin_response_reset = false;
                                    break;
                                }
                            }
                        }
                    } else if (data[5] < 3) {
                        __self.irc.emit('message', {message:__self.pre_text + 'Timer cannot be less than 2 seconds'});
                    }
                }
            }
        }
    }

    // public commands related to !<currency>
    switch (data[3].slice(1)) {
    // submit bid for the auction
    case '!bid':
        if (isNaN(parseInt(data[4], 10)) === false) {
            if (data[4] > 0 && data[4] % 1 === 0) {
                __self.bid(__self.irc.caller(data[0]), parseInt(data[4], 10));
            }
        }
        break;
    // purchase a ticket for raffle
    case '!ticket':
        if (isNaN(parseInt(data[4], 10)) === false) {
            if (data[4] >= 0 && data[4] % 1 === 0) {
                __self.collect_tickets(__self.irc.caller(data[0]), parseInt(data[4], 10));
            }
        }
        break;
    }

    // place a bet
    if (__self.bets_status === true) {
        for (var i = 0; i < __self.bets_board.length; i++) {
            if (data[3].slice(1) === '!' + __self.bets_board[i]) {
                if (isNaN(parseInt(data[4], 10)) === false) {
                    if (data[4] >= 0 && data[4] % 1 === 0) {
                        __self.collect_bets(__self.irc.caller(data[0]), __self.bets_board[i], parseInt(data[4], 10));
                        break;
                    }
                }
            }
        }
    }
};

/**
 * ============================================
 * CURRENCY REQUESTS
 * --------------------------------------------
 */
Currency.prototype.get_coins = function (caller) {
    var __self = this;

    function fill_request(viewer, points) {
        var request = '(' + points + ')';

        if (__self.raffle_status) {
            for (var i = 0; i < __self.raffle_ticket_requests.length; i++){
                if (__self.raffle_ticket_requests[i].viewer.toLowerCase() === viewer.toLowerCase() && (__self.raffle_ticket_requests[i].tickets * __self.raffle_ticket_cost) <= points) {
                    request = '(' + (points - (__self.raffle_ticket_requests[i].tickets * __self.raffle_ticket_cost)) + ') [' + __self.raffle_ticket_requests[i].tickets + ']';
                    break;
                }
            }
            return request;
        } else {
            return request;
        }
    }

    function do_work() {
        var multi_response = '';

        if (__self.coin_flood.length > 1) {// send flood requests
            __self.query_coins(__self.coin_flood, function (rows) {
                for (var i = 0; i < rows.length; i++) {
                    var currency_request = fill_request(rows[i].user, rows[i].points);
                    // setup currency response
                    if (i !== rows.length - 1) {
                        multi_response += rows[i].user + ' ' + currency_request + ', ';
                    } else {
                        multi_response += rows[i].user + ' ' + currency_request;
                    }
                }
                __self.irc.emit('message', {message:__self.pre_text + multi_response, timer: 1});
            });
        } else if (__self.coin_flood.length === 1) {// send single request
            __self.query_coins(caller, function (rows) {
                var currency_request = fill_request(rows[0].user, rows[0].points);
                __self.irc.emit('message', {message:__self.pre_text + caller + ' ' + currency_request, timer: 1});
            });
        }

        // clear flood requests
        __self.coin_flood = [];
    }

    // add flood users to array
    if (__self.coin_flood.indexOf(caller) < 0) {
        __self.coin_flood.push(caller);
    }

    // clear timer on flood
    if (__self.coin_response_reset) {
        clearTimeout(__self.coin_response);
    }

    // check if flood has a set amount of requests and output
    // if not, set the output timer
    if (__self.coin_flood.length === __self.max_requests) {
        do_work();
    } else {
        if (__self.coin_response_reset) {
            __self.coin_response = setTimeout(function () {do_work();}, __self.coin_response_timer);
        } else {
            setTimeout(function () {do_work();}, __self.coin_response_timer);
        }
    }
};

Currency.prototype.query_coins = function (data, callback) {
    var __self = this, sql = '';

    // build sql conditions
    if (typeof data === 'string') {
        sql = 'SELECT * FROM viewers WHERE ' + 'user = \'' + data.toLowerCase() + '\'';
    } else {
        for (var i = 0; i < data.length; i++) {
            if (i !== data.length - 1) {
                sql += 'SELECT * FROM viewers WHERE ' + 'user = \'' + data[i].toLowerCase() + '\'' + ';';
            } else {
                sql += 'SELECT * FROM viewers WHERE ' + 'user = \'' + data[i].toLowerCase() + '\'';
            }
        }
    }

    // execute query
    __self.db.execute(sql, function (rows) {
        var temp = [], newrows = [];
        if (typeof data !== 'string') {
            // get rid of the nested arrays
            for (var i = 0; i < rows.length; i++) {
                if (rows[i].length > 0) {
                    newrows.push(rows[i][0]);
                }
            }

            // separate users into their own array
            for (var i = 0; i < newrows.length; i++) {
                temp.push(newrows[i].user.charAt(0).toUpperCase() + newrows[i].user.slice(1));
            }

            // compare the users in the data array against the temp array
            // if not found, push them to rows with 0 points
            for (var i = 0; i < data.length; i++) {
                if (temp.indexOf(data[i]) < 0) {
                    newrows.push({'user' : data[i], 'points' : 0});
                }
            }

            // capitalize usernames on rows
            for (var key in newrows) {
                if (newrows.hasOwnProperty(key)) {
                    newrows[key].user = newrows[key].user.charAt(0).toUpperCase() + newrows[key].user.slice(1);
                }
            }
            rows = newrows;
        } else {
            if (rows.length === 0) {
                rows = [{'user' : data, 'points' : 0}];
            } else {
                rows[0].user = rows[0].user.charAt(0).toUpperCase() + rows[0].user.slice(1);
            }
        }
        callback(rows);
    });
};

/**
 * ============================================
 * HANDOUT CURRENCY
 * --------------------------------------------
 */
Currency.prototype.handout_coins = function () {
    var __self = this;

    // check stream status
    function stream_status() {
        var time = utils.make_interval(__self.streaming_check);
        if (time === 0) {
            // get stream status
            https.get('https://api.twitch.tv/kraken/streams/' + __self.irc.config.channel.slice(1), function (response) {
                var body = '';

                // put together response
                response.on('data', function (chunk) {
                    body += chunk;
                });

                // start / stop handing out coins based on stream status
                response.on('end', function () {
                    var json = JSON.parse(body);
                    __self.streaming = json.stream !== null;
                    if (__self.streaming && __self.give_coins === false) {
                        insert_coins();
                    }
                    __self.irc.emit('data', 'DATA - Online Status Check - Returned: ' + __self.streaming);
                    setTimeout(stream_status, 1000);
                });
            });
        } else {
            setTimeout(stream_status, time);
        }
    }

    // get subscribers
    function subscribers() {/*
        var time = utils.make_interval(__self.subscriber_check);
        if (time === 0) {
            // get stream status
            http.get(__self.config.subscribers_json, function (response) {
                var body = '';
                // put together response
                response.on('data', function (chunk) {
                    body += chunk;
                });

                // start / stop handing out coins based on stream status
                response.on('end', function () {
                    var json = JSON.parse(body);
                    var entries = json.feed.entry, subs = '';
                    __self.subscribers = [];
                    for (var i = 0; i < entries.length; i++) {
                        __self.subscribers.push(entries[i].title['$t']);
                        subs += entries[i].title['$t'] + ' ';
                    }
                    __self.irc.emit('data', 'DATA - Subscriber Check - Returned: ' + subs);
                    setTimeout(subscribers, 1000);
                });
            });
        } else {
            setTimeout(subscribers, time);
        }*/
    }

    // trigger coin handout
    function insert_coins() {
        __self.give_coins = __self.streaming;
        if (__self.give_coins) {
            var time = utils.make_interval(__self.give_coins_timer);
            if (time === 0) {
                http.get("http://tmi.twitch.tv/group/user/"+__self.irc.config.channel.slice(1)+"/chatters", function (response) {
                var body = '';
                // put together response
                response.on('data', function (chunk) {
                  body += chunk;
                });

                response.on('end', function () {
                    var json = JSON.parse(body);
                    var entries = json.chatters.viewers;
                    __self.irc.emit('data', 'DATA - Loaded viewers - Returned: ' + entries);
                    __self.viewers = [];
                    for (var i = 0; i < entries.length; i++) {
                        __self.viewers.push(entries[i]);
                    }
                });
              }).on('error',function(e){
                      console.log("Couldn't get user list.  Error: ", e);
                    });

                  if (__self.give_coins) {
                    if (__self.viewers != null) {
                      var clone_viewer_list = __self.viewers;

                      // build sql from the saved viewer list
                      var sql = '';
                      for (var i = 0; i < clone_viewer_list.length; i++) {
                          var currency_amount = 1; // __self.subscribers.indexOf(clone_viewer_list[i]) >= 0 ? 2 : 1;
                          if (clone_viewer_list[i] !== '') {
                              // repeat pattern till the last in the list
                              if (i != clone_viewer_list.length - 1) {
                                  sql += 'INSERT INTO viewers (user, points) ';
                                  sql += 'VALUES (\'' + clone_viewer_list[i] + '\', ' + currency_amount + ') ';
                                  sql += 'ON DUPLICATE KEY UPDATE points = points + ' + currency_amount + '; ';
                              } else {
                                  sql += 'INSERT INTO viewers (user, points) ';
                                  sql += 'VALUES (\'' + clone_viewer_list[i] + '\', ' + currency_amount + ') ';
                                  sql += 'ON DUPLICATE KEY UPDATE points = points + ' + currency_amount;
                              }
                          }
                      }

                      // execute query
                      if (sql !==''){
                        __self.db.execute(sql, function () {
                        __self.irc.msg("/me sprinkles xp");
                        });
                      }

                    }
                  }

                    // Deprecated
                    // __self.irc.raw('WHO ' + __self.irc.config.channel);
                    // give coins after \who and handout_coins is true

                    // json is retrieved; build the array and go to work.


                    setTimeout(insert_coins, 1000);
            } else {
                setTimeout(insert_coins, time);
            }
        }
    }

    // monitor viewers in irc
    __self.irc.on('data', function (data) {
        if (__self.streaming) {
            var data_split = data.split(' '), viewer = '';

            // viewers from \who
            /*
            if (data_split[3] == '352') {
                if (data_split[6] !== undefined) {
                    viewer = data_split[6].toLowerCase();
                    if (__self.viewer_list.indexOf(viewer) < 0) {
                        __self.viewer_list.push(viewer);
                    }
                }
            }
            */

            // viewers chatting
            if (data_split[3] == 'PRIVMSG') {
                var servernick = data_split[2].toLowerCase().split('!');
                viewer = servernick[0];
                if (viewer  != __self.irc.config.name.toLowerCase()) {
                    viewer = viewer.slice(1);
                }
                if (__self.viewer_list.indexOf(viewer) < 0) {
                    __self.viewer_list.push(viewer);
                }
            }

        } else {
            __self.viewer_list = [];
        }
    });

    stream_status();

    // only start subscribers if gdoc is available
    if (__self.config.subscribers_json !== '') {
        subscribers();
    }
};

/**
 * ============================================
 * Adjust Currency
 * --------------------------------------------
 */
Currency.prototype.adjust_currency = function (method, amount, viewer) {
    var __self = this;

    viewer = viewer.toLowerCase();

    __self.db.execute('SELECT * FROM viewers WHERE user=\'' + viewer + '\'', function(rows){
        if (rows.length > 0 || method === 'push') {
            var check = rows.length > 0 ? rows[0].user : rows.push({user: viewer});
            if (check === viewer || method === 'push') {
                var sql = '', settings = [];

                // push settings for message
                if (method === 'add' || method === 'push') {
                    settings.push('+');
                    settings.push('Added');
                    settings.push('to');
                } else if (method === 'remove') {
                    settings.push('-');
                    settings.push('Removed');
                    settings.push('from');
                }
                settings.push(rows[0].user.charAt(0).toUpperCase() + rows[0].user.slice(1));

                // create sql
                if (method === 'add' || method === 'remove') {
                    sql += 'UPDATE viewers ';
                    sql += 'SET points = points ' + settings[0] + ' ' + amount + ' ';
                    sql += 'WHERE user = \'' + rows[0].user + '\'; ';
                } else if (method === 'push') {
                    sql += 'INSERT INTO viewers (user, points) ';
                    sql += 'VALUES (\'' + viewer + '\', ' + amount + ') ';
                    sql += 'ON DUPLICATE KEY UPDATE points = points + ' + amount + '; ';
                }

                //execute adjustment
                __self.db.execute(sql, function(){
                    __self.irc.emit('message', {message:__self.pre_text + settings[1] + ' ' + amount + ' ' + __self.config.currency + ' ' + settings[2] + ' ' + settings[3]});
                });
            }
        } else {
            __self.irc.emit('message', {message:__self.pre_text + 'User was not found, use the push command to add a new user'});
        }
    });
};

/**
 * ============================================
 * AUCTION SYSTEM
 * --------------------------------------------
 */
Currency.prototype.auction = function (status) {
    var __self = this;

    switch (status) {
    case true:
        if (!__self.bets_status) {
            if (!__self.raffle_status) {
                if (!__self.auction_status) {
                    // open up the auction
                    __self.auction_status = true;

                    // request toggle
                    if (__self.temp.raffle_toggle) {
                        __self.temp.auction_toggle = __self.temp.raffle_toggle;
                    } else {
                        __self.temp.auction_toggle = __self.coin_toggle;
                    }
                    __self.coin_toggle = false;

                    // default request timer
                    if (__self.temp.raffle_timer && __self.temp.raffle_timer_reset) {
                        __self.temp.auction_timer = __self.temp.raffle_timer;
                        __self.temp.auction_timer_reset = __self.temp.raffle_timer_reset;
                    } else {
                        __self.temp.auction_timer = __self.coin_response_timer;
                        __self.temp.auction_timer_reset = __self.coin_response_reset;
                    }
                    __self.coin_response_timer = 3000;
                    __self.coin_response_reset = true;

                    // clear previous bids
                    __self.auction_bids = [];
                    __self.auction_previous_bid = {};

                    // auction open response
                    __self.irc.emit('message', {message:__self.pre_text + 'Auction opened, accepting bids'})
                } else {
                    // auction is already open response
                    __self.irc.emit('message', {message:__self.pre_text + 'Auction already in progress'});
                }
            } else {
                // raffle currently running
                __self.irc.emit('message', {message:__self.pre_text + 'You must close the raffle before you can open an auction'});
            }
        } else {
            // gambling currently running
            __self.irc.emit('message', {message:__self.pre_text + 'Betting must be closed before you can open an auction'});
        }
        break;
    case false:
        if (__self.auction_status) {
            // close the auction
            __self.auction_status = false;

            // request toggle
            __self.coin_toggle = __self.temp.auction_toggle;
            delete __self.temp.auction_toggle;

            // default request timer
            __self.coin_response_timer = __self.temp.auction_timer;
            __self.coin_response_reset = __self.temp.auction_timer_reset;
            delete __self.temp.auction_timer;
            delete __self.temp.auction_timer_reset;

            // clear response timers
            clearTimeout(__self.auction_bid_response);
            clearInterval(__self.auction_bid_response_long);

            if (__self.auction_bids.length > 0) {
                // pick a winner response
                for (var i = 0; i < __self.auction_bids.length; i++) {
                    if (__self.auction_bids[i].bid === utils.max(__self.auction_bids)) {
                        __self.irc.emit('message', {message:__self.pre_text + 'Auction closed, Winner: ' + __self.auction_bids[i].viewer + ' @ ' + __self.auction_bids[i].bid});

                        // save the winners info for draw refund
                        __self.auction_previous_bid.viewer = __self.auction_bids[i].viewer;
                        __self.auction_previous_bid.bid = __self.auction_bids[i].bid;

                        // remove winners money
                        var sql = '';
                        sql += 'UPDATE viewers ';
                        sql += 'SET points = points - ' + __self.auction_bids[i].bid + ' ';
                        sql += 'WHERE user = \'' + __self.auction_bids[i].viewer + '\'';
                        __self.db.execute(sql, function() {});

                        // remove winner from main list
                        __self.auction_bids.splice(i, 1);

                        break;
                    }
                }
            } else {
                // no bidders to pick from response
                __self.irc.emit('message', {message:__self.pre_text + 'Auction closed, no bidders to pick a winner'});
            }
        } else {
            // auction is already open response
            __self.irc.emit('message', {message:__self.pre_text + 'Auction is already closed'});
        }
        break;
    case 'cancel':
        if (__self.auction_status) {
            // close the auction
            __self.auction_status = false;

            // request toggle
            __self.coin_toggle = __self.temp.auction_toggle;
            delete __self.temp.auction_toggle;

            // default request timer
            __self.coin_response_timer = __self.temp.auction_timer;
            __self.coin_response_reset = __self.temp.auction_timer_reset;
            delete __self.temp.auction_timer;
            delete __self.temp.auction_timer_reset;

            // clear response timers
            clearTimeout(__self.auction_bid_response);
            clearInterval(__self.auction_bid_response_long);

            // clear previous bids
            __self.auction_bids = [];
            __self.auction_previous_bid = {};

            // auction cancelled notification
            __self.irc.emit('message', {message:__self.pre_text + 'Auction has been cancelled'});
        } else {
            // auction cancelled notification
            __self.irc.emit('message', {message:__self.pre_text + 'Auction is not opened'});
        }
        break;
    }
};

Currency.prototype.bid = function (caller, amount) {
    var __self = this;

    function find_duplicate(amount) {
        var duplicate = false;
        for (var i = 0; i < __self.auction_bids.length; i++) {
            if (__self.auction_bids[i].bid === amount) {
                duplicate = true;
                break;
            }
        }
        return duplicate;
    }

    if (__self.auction_status) {
        // verify that bidder has the coins for bidding
        __self.query_coins(caller, function (rows) {
            var has_tickets = false;

            // only add bid if they have the enough to pay
            if (rows[0].points >= amount) {
                if (__self.auction_bids.length > 0) {
                    // check if an existing bid exists and modify it
                    for (var i = 0; i < __self.auction_bids.length; i++) {
                        if (__self.auction_bids[i].viewer === caller) {
                            has_tickets = true;
                            // check if bid is higher then original and not a duplicate
                            if (__self.auction_bids[i].bid < amount && !find_duplicate(amount)) {
                                __self.auction_bids[i].bid = amount;
                            }
                            break;
                        }
                    }

                    // add new bids to list if they are not a duplicate
                    if (!has_tickets && !find_duplicate(amount)) {
                        __self.auction_bids.push({viewer: caller, bid: amount});
                    }
                } else {
                    // push first bid
                    __self.auction_bids.push({viewer: caller, bid: amount});
                }
            }

            // clear timers on flood
            clearTimeout(__self.auction_bid_response);
            clearInterval(__self.auction_bid_response_long);

            // reply after set amount of bids
            if ((__self.auction_bids.length % __self.max_requests) === 0) {
                // bulk flood response
                for (var i = 0; i < __self.auction_bids.length; i++) {
                    if (__self.auction_bids[i].bid === utils.max(__self.auction_bids)) {
                        __self.irc.msg(__self.pre_text + 'Highest bid, ' + __self.auction_bids[i].viewer + ' @ ' + __self.auction_bids[i].bid);
                    }
                }
            } else {
                // response after time without flood has passed
                var viewer, bid;
                for (var i = 0; i < __self.auction_bids.length; i++) {
                    if (__self.auction_bids[i].bid === utils.max(__self.auction_bids)) {
                        viewer = __self.auction_bids[i].viewer;
                        bid = __self.auction_bids[i].bid;
                    }
                }
                if (viewer !== undefined && bid !== undefined && __self.auction_status) {
                    var msg = __self.pre_text + 'Highest bid, ' + viewer + ' @ ' + bid;
                    __self.auction_bid_response = setTimeout(function () {__self.irc.emit('message', {message:msg, timer: 1});}, 5000);
                    __self.auction_bid_response_long = setInterval(function () {__self.irc.emit('message', {message:msg, timer: 1});}, 30000);
                }
            }
        });
    }
};

Currency.prototype.next_auction_winner = function () {
    var __self = this, empty_list = [];

    // custom dialog when the bidder list is empty
    empty_list.push('Hey, I just met you and this is crazy, but there\'s no more bidders, so start an new auction maybe?');
    empty_list.push('Are there more bidders? Well, to tell you the truth, in all this excitement I kind of lost track myself.');
    empty_list.push('Heyyyyyy there\'s no more bidders, Op, op, op, op, Open Auction Style.');
    empty_list.push('Da bids! Da bids! Where are all da bids, boss?');

    if (!__self.auction_status) {
        // get next highest bidder or prompt to open new auction
        if (__self.auction_bids.length > 0) {
            for (var i = 0; i < __self.auction_bids.length; i++) {
                if (__self.auction_bids[i].bid === utils.max(__self.auction_bids)) {
                    __self.irc.emit('message',{message:__self.pre_text + 'Drawing the next highest bid: ' + __self.auction_bids[i].viewer + ' @ ' + __self.auction_bids[i].bid});

                    // refund previous winner's money
                    var sql = '';
                    sql += 'UPDATE viewers ';
                    sql += 'SET points = points + ' + __self.auction_previous_bid.bid + ' ';
                    sql += 'WHERE user = \'' + __self.auction_previous_bid.viewer + '\'';
                    __self.db.execute(sql, function() {});

                    // save the new winner's info for next draw
                    __self.auction_previous_bid.viewer = __self.auction_bids[i].viewer;
                    __self.auction_previous_bid.bid = __self.auction_bids[i].bid;

                    // remove winners money
                    sql = '';
                    sql += 'UPDATE viewers ';
                    sql += 'SET points = points - ' + __self.auction_bids[i].bid + ' ';
                    sql += 'WHERE user = \'' + __self.auction_bids[i].viewer + '\'';
                    __self.db.execute(sql, function() {});

                    // remove winner from main list
                    __self.auction_bids.splice(i, 1);

                    break;
                }
            }
        } else {
            // check if a previous viewer is saved
            if (__self.auction_previous_bid.viewer !== null) {
                // refund previous winner's money
                var sql = '';
                sql += 'UPDATE viewers ';
                sql += 'SET points = points + ' + __self.auction_previous_bid.bid + ' ';
                sql += 'WHERE user = \'' + __self.auction_previous_bid.viewer + '\'';
                __self.db.execute(sql, function() {});

                // clear previous bid
                __self.auction_previous_bid = {};
            }

            // notify that there's no more bids
            __self.irc.emit('message',{message:__self.pre_text + utils.selectRandomArrayItem(empty_list)});
        }
    }
};

/**
 * ============================================
 * RAFFLE SYSTEM
 * --------------------------------------------
 */
Currency.prototype.raffle = function (status) {
    var __self = this;

    switch (status) {
    case true:
        if (!__self.bets_status) {
            if (!__self.auction_status) {
                if (!__self.raffle_status) {
                    // open up a raffle
                    __self.raffle_status = true;

                    // request toggle
                    if (__self.temp.auction_toggle) {
                        __self.temp.raffle_toggle = __self.temp.auction_toggle;
                    } else {
                        __self.temp.raffle_toggle = __self.coin_toggle;
                    }
                    __self.coin_toggle = false;

                    // default request timer
                    if (__self.temp.auction_timer && __self.temp.auction_timer_reset) {
                        __self.temp.raffle_timer = __self.temp.auction_timer;
                        __self.temp.raffle_timer_reset = __self.temp.auction_timer_reset;
                    } else {
                        __self.temp.raffle_timer = __self.coin_response_timer;
                        __self.temp.raffle_timer_reset = __self.coin_response_reset;
                    }
                    __self.coin_response_timer = 3000;
                    __self.coin_response_reset = true;

                    // save previous raffle settings in case
                    // a new one is opened on accident
                    __self.raffle_restore_ticket_requests = __self.raffle_ticket_requests;
                    __self.raffle_restore_tickets = __self.raffle_tickets;

                    // clear previous tickets
                    __self.raffle_ticket_requests = [];
                    __self.raffle_tickets = [];

                    // raffle open response
                    __self.irc.emit('message',{message:__self.pre_text + 'Raffle opened'});
                    __self.irc.emit('message',{message:'+ Tickets cost ' + __self.raffle_ticket_cost + ' ' + __self.config.currency.toLowerCase() + ' / Maximum of ' + __self.raffle_max_tickets + ' tickets per viewer'});
                } else {
                    // raffle in progress response
                    __self.irc.emit('message',{message:__self.pre_text + 'Raffle already in progress'});
                }
            } else {
                // auction in progress
                __self.irc.emit('message', {message:__self.pre_text + 'You must close the auction before you can open an a raffle'});
            }
        } else {
            // gambling currently running
            __self.irc.emit('message', {message:__self.pre_text + 'Betting must be closed before you can open a raffle'});
        }
        break;
    case false:
        if (__self.raffle_status) {
            // close the raffle
            __self.raffle_status = false;

            // request toggle
            __self.coin_toggle = __self.temp.raffle_toggle;
            delete __self.temp.raffle_toggle;

            // default request timer
            __self.coin_response_timer = __self.temp.raffle_timer;
            __self.coin_response_reset = __self.temp.raffle_timer_reset;
            delete __self.temp.raffle_timer;
            delete __self.temp.raffle_timer_reset;

            // validation / winner / deduction
            __self.raffle_winner();
        } else {
            // raffle is already open response
            __self.irc.emit('message',{message:__self.pre_text + 'Raffle is already closed'});
        }
        break;
    case 'cancel':
        if (__self.raffle_status) {
            // close the raffle
            __self.raffle_status = false;

            // request toggle
            __self.coin_toggle = __self.temp.raffle_toggle;
            delete __self.temp.raffle_toggle;

            // default request timer
            __self.coin_response_timer = __self.temp.raffle_timer;
            __self.coin_response_reset = __self.temp.raffle_timer_reset;
            delete __self.temp.raffle_timer;
            delete __self.temp.raffle_timer_reset;

            // clear previous tickets
            __self.raffle_ticket_requests = [];
            __self.raffle_tickets = [];

            // raffle cancelled notification
            __self.irc.emit('message', {message:__self.pre_text + 'Raffle has been cancelled'});
        } else {
            // raffle cancelled notification
            __self.irc.emit('message', {message:__self.pre_text + 'Raffle is not opened'});
        }
        break;
    case 'restore':
        if (__self.raffle_status) {
            // close raffle
            __self.raffle_status = false;

            // restore previous raffle tickets
            __self.raffle_ticket_requests = __self.raffle_restore_ticket_requests;
            __self.raffle_tickets = __self.raffle_restore_tickets;

            __self.irc.emit('message', {message:__self.pre_text + 'Previous raffle has been restored'});
        } else {
            // raffle restore failed notification
            __self.irc.emit('message', {message:__self.pre_text + 'Raffle is closed, unable to restore'});
        }
        break;
    }
};

Currency.prototype.collect_tickets = function (caller, amount) {
    var __self = this, has_tickets = false;

    if (__self.raffle_ticket_requests.length > 0) {
        // check if viewer already has tickets
        for (var i = 0; i < __self.raffle_ticket_requests.length; i++) {
            if (__self.raffle_ticket_requests[i].viewer === caller) {
                has_tickets = true;
                if (amount <= __self.raffle_max_tickets && amount >= 1) {
                    __self.raffle_ticket_requests[i].tickets = amount;
                } else if (amount === 0) {
                    __self.raffle_ticket_requests.splice(i, 1);
                }
                break;
            }
        }

        // if viewer doesn't have tickets and meets > 1 < max req add their request
        if (!has_tickets && amount <= __self.raffle_max_tickets && amount >= 1 && amount !== 0) {
            __self.raffle_ticket_requests.push({viewer: caller, tickets: amount});
        }
    } else {
        // push first ticket if > 1 < max
        if (amount <= __self.raffle_max_tickets && amount >= 1 && amount !== 0) {
            __self.raffle_ticket_requests.push({viewer: caller, tickets: amount});
        }
    }
};

Currency.prototype.raffle_winner = function () {
    var __self = this, sql = '';

    if (__self.raffle_ticket_requests.length > 0) {
        // setup sql to grab all viewers that request coins from the database
        sql += 'SELECT * FROM viewers WHERE ';
        for (var i = 0; i < __self.raffle_ticket_requests.length; i++) {
            if (i !== __self.raffle_ticket_requests.length - 1) {
                sql += 'user=\'' + __self.raffle_ticket_requests[i].viewer.toLowerCase() + '\' OR ';
            } else {
                sql += 'user=\'' + __self.raffle_ticket_requests[i].viewer.toLowerCase() + '\'';
            }
        }

        // execute viewer search query
        __self.db.execute(sql, function(rows) {
            // currency validation
            // - this takes the results of the query and uses the names from the database
            // to filter through the viewers that requested tickets (since they have to be in the
            // database in the first place)
            // - during the filtering process the viewers requested tickets are multiplied by the
            // ticket cost and compared against their currency amount
            // - if the viewer has the funds, their tickets are added and the sql is updated to include their
            // deduction
            sql = '';
            for (var i = 0; i < rows.length; i++) {
                for (var j = 0; j < __self.raffle_ticket_requests.length; j++) {
                    if (__self.raffle_ticket_requests[j].viewer.toLowerCase() === rows[i].user) {
                        var money = __self.raffle_ticket_requests[j].tickets * __self.raffle_ticket_cost;

                        if (rows[i].points >= money) {
                            for (var k = 1; k <= __self.raffle_ticket_requests[j].tickets; k++) {
                                __self.raffle_tickets.push(__self.raffle_ticket_requests[j].viewer);
                            }
                            if (i !== rows.length - 1) {
                                sql += 'UPDATE viewers ';
                                sql += 'SET points = points - ' + money + ' ';
                                sql += 'WHERE user = \'' + rows[i].user + '\'; ';
                            } else {
                                sql += 'UPDATE viewers ';
                                sql += 'SET points = points - ' + money + ' ';
                                sql += 'WHERE user = \'' + rows[i].user + '\'';
                            }
                        }
                        break;
                    }
                }
            }

            // randomize array before selecting a random winner
            __self.raffle_tickets.sort(function () {return 0.5 - Math.random();});

            // select random ticket from array
            var winner = utils.selectRandomArrayItem(__self.raffle_tickets);

            // count winner's tickets
            var winning_ticket_amount;
            for (var i = 0; i < __self.raffle_ticket_requests.length; i++) {
                if (__self.raffle_ticket_requests[i].viewer === winner) {
                    winning_ticket_amount = __self.raffle_ticket_requests[i].tickets;
                    break;
                }
            }

            // output winner to chat
            __self.irc.emit('message', {message:__self.pre_text + 'Raffle closed, ' + __self.raffle_tickets.length + ' tickets purchased!'});
            __self.irc.emit('message', {message:'+ Winner: ' + winner + ' (' + winning_ticket_amount + ' tickets purchased)'});

            // remove one ticket from raffle bowl
            if (__self.raffle_tickets.indexOf(winner) >= 0 ) {
                __self.raffle_tickets.splice(__self.raffle_tickets.indexOf(winner), 1);
            }

            // execute query
            __self.db.execute(sql, function () {});
        });
    } else {
        // no tickets to pick from response
        __self.irc.emit('message', {message:__self.pre_text + 'Raffle closed, no tickets to draw a winner'});
    }
};

Currency.prototype.next_raffle_winner = function () {
    var __self = this, empty_list = [];

    // custom dialog when there are no more raffle tickets
    empty_list.push('Hey, I just met you and this is crazy, but there\'s no more tickets, so start an new raffle maybe?');
    empty_list.push('Are there more tickets? Well, to tell you the truth, in all this excitement I kind of lost track myself.');
    empty_list.push('Heyyyyyy there\'s no more tickets, Op, op, op, op, Open Raffle Style.');
    empty_list.push('Da tickets! Da tickets! Where are all da tickets, boss?');

    if (!__self.raffle_status) {
        // draw next ticket or prompt to open new raffle
        if (__self.raffle_tickets.length > 0) {
            // randomize array before selecting a random winner
            __self.raffle_tickets.sort(function () {return 0.5 - Math.random();});

            // select random ticket from array
            var winner = utils.selectRandomArrayItem(__self.raffle_tickets);

            // count next winner's tickets
            var winning_ticket_amount;
            for (var i = 0; i < __self.raffle_ticket_requests.length; i++) {
                if (__self.raffle_ticket_requests[i].viewer === winner) {
                    winning_ticket_amount = __self.raffle_ticket_requests[i].tickets;
                    break;
                }
            }

            // output winner to chat
            __self.irc.emit('message', {message:__self.pre_text + 'Drawing next ticket'});
            __self.irc.emit('message', {message:'+ Winner: ' + winner + ' (' + winning_ticket_amount + ' tickets purchased)'});

            // remove one ticket from raffle bowl
            if (__self.raffle_tickets.indexOf(winner) >= 0 ) {
                __self.raffle_tickets.splice(__self.raffle_tickets.indexOf(winner), 1);
            }
        } else {
            __self.irc.emit('message', {message:__self.pre_text + utils.selectRandomArrayItem(empty_list)});
        }
    }
};

/**
 * ============================================
 * BETTING SYSTEM
 * --------------------------------------------
 */
Currency.prototype.bets = function(status, data) {
    var __self = this;

    switch(status){
        case true:
            if (!__self.auction_status) {
                if (!__self.raffle_status) {
                    if (!__self.bets_status && !__self.bets_payout) {
                        var wager_msg = '';

                        // open up bets
                        __self.bets_status = true;
                        __self.bets_payout = true;

                        // clear previous board / bets
                        __self.bets_board = [];
                        __self.bets_viewers = [];

                        // create new betting board
                        __self.bets_board = data.join().split(',').filter(function(n){return n}).slice(6);

                        // create chat message on how to place a bet
                        for (var i = 0; i < __self.bets_board.length; i++) {
                            if (i !== __self.bets_board.length - 1) {
                                wager_msg += '"!' + __self.bets_board[i] + '" / ';
                            } else {
                                wager_msg += '"!' + __self.bets_board[i] + '"';
                            }
                        }

                        // output to chat
                        __self.irc.emit('message', {message:__self.pre_text + 'Betting is now open'});
                        __self.irc.emit('message', {message:'+ Type ' + wager_msg + ' and the bet amount to enter'});
                    } else {
                        if (__self.bets_payout) {
                            // payout pending message
                            __self.irc.emit('message', {message:__self.pre_text + 'Unable to take new bets until previous have been paid out'});
                        } else {
                            // gambling is already open response
                            __self.irc.emit('message', {message:__self.pre_text + 'Betting already in progress'});
                        }
                    }
                } else {
                    // raffle in progress
                    __self.irc.emit('message', {message:__self.pre_text + 'Betting must be closed before you can open a raffle'});
                }
            } else {
                // auction currently running
                __self.irc.emit('message', {message:__self.pre_text + 'Betting must be closed before you can open an auction'});
            }
            break;
        case false:
            if (__self.bets_status && __self.bets_payout) {
                // close out bets
                __self.bets_status = false;

                // output to chat
                if (__self.bets_viewers.length > 0) {
                    __self.irc.emit('message', {message:__self.pre_text + 'Betting is now closed'});
                } else {
                    __self.irc.emit('message', {message:__self.pre_text + 'Betting closed, no bets were placed'});
                }

                // deduct bets from viewers amounts
                __self.bets_deduct_bets();
            }
            break;
        case 'winner':
            // set payout to complete
            __self.bets_payout = false;
            break;
    }
};

Currency.prototype.collect_bets = function (caller, bet, amount) {
    var __self = this, has_bet = false;

    if (__self.bets_viewers.length > 0) {
        for (var i = 0; i < __self.bets_viewers.length; i++) {
            if (__self.bets_viewers[i].viewer === caller) {
                has_bet = true;
                if (amount >= 1) {
                    __self.bets_viewers[i].bet = bet;
                    __self.bets_viewers[i].amount = amount;
                } else if (amount === 0 && bet === __self.bets_viewers[i].bet) {
                    __self.bets_viewers.splice(i, 1);
                }
                break;
            }
        }
        if (!has_bet && amount >= 1 && amount !== 0) {
            __self.bets_viewers.push({viewer: caller, bet: bet, amount: amount});
        }
    } else {
        if (amount >= 1 && amount !== 0) {
            __self.bets_viewers.push({viewer: caller, bet: bet, amount: amount});
        }
    }
    console.log(__self.bets_viewers);
};

Currency.prototype.bets_deduct_bets = function () {

};

module.exports = function (irc, db, options) {
    return new Currency(irc, db, options);
};
