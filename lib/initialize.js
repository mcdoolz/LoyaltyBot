var file = require('fs');

//create logs directory
file.exists('./../logs', function (exists) {
    if (!exists) {
        file.mkdir('./../logs');
    }
});

process.on('uncaughtException', function(err) {
    file.appendFile('./../logs/error-log.txt', err.message + '\r\n' + err.stack + '\r\n', function() {});
});

exports.initialize = function(options) {
    var config = options || {}, db, irc, commands, dashboard, currency;

//-------- Setup -------
    irc = require('./irc.js')({
        name    : config.twitch.bot.name,
        pass    : config.twitch.bot.password,
        channel : '#' + config.twitch.channel
    });
    db = require('./mysql.js')({
        host     : config.currency.host,
        user     : config.currency.user,
        password : config.currency.password,
        database : config.currency.database
    });
    commands = require('./commands.js')(irc, db, {
        bot_name : config.twitch.bot.name,
        currency : config.currency.name
    });
    currency = require('./currency.js')(irc, db, {
        currency    : config.currency.name,
        payrate     : config.currency.payrate,
        subscribers : config.twitch.subscribers,
        website     : config.currency.website
        modcommands : config.currency.modcommands
    });

//-------- Start -------
    irc.start();
    db.start();
    currency.start();
    if (config.commands === true) commands.start();

    irc.on('data', function (data) {
        console.log(data);
        irc.realtime(data);
    });

    irc.on('command', function (data) {
        currency.commands(data);
        if (config.commands === true) commands.commands(data);
    });

    irc.on('message', function (msg) {
       irc.queue(msg);
    });
};
