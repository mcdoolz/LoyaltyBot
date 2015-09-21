# LoyaltyBot : "Hack my Bitch Up" Edition
A TwitchTV viewer reward system

Written in JavaScript and Node

## Overview
LoyaltyBot 'HmBU' (pronounced Himboo) Edition is a chat bot that allows you to reward viewers with EXPERIENCE points for hanging out on your stream. It's main purpose is to allow you, the broadcaster, to reward the viewers that are dedicated to watching your stream as opposed to the viewers that just stop by for a quick giveaway and leave (because fuck those guys).

####Features
- Possibly functioning auction and raffle systems (haven't tested them, but the codes there)

####Extras
- Moderator commands (semi functional)

## Basic Setup
Copy example.js and modify to suit your needs. Remove or comment the subscribers line; it's not necessary.

```javascript
var loyaltybot = require('./../lib/initialize.js');

loyaltybot.initialize({
    // twitch info
    twitch : {
        channel     : 'loyalty',
        bot         : {name: 'LoyaltyBot', password: 'loyalty!loyalty!loyalty!'},
    },

    // currency info
    currency : {
        name     : 'Points',
        payrate  : 15,
        host     : '127.0.0.1',
        user     : 'mysql_user',
        password : 'mysql_password',
        database : 'mysql_database',
        website  : '' // <--- CAN BE AN EMPTY STRING
    },

    // optional features
    commands: true
});
```

## Configuration Options
Twitch
- `channel`: the channel name (in lower case)
- `bot.name`: the account name of the bot
- `bot.password`: the password for the bot
- `subscribers`: a google doc that contains subscriber names (more info on this later)

Currency
- `name`: custom name for the loyalty points
- `payrate`: how often to hand out an experience point (measured in minutes)
- `host`: mysql database hostname/ip
- `user`: username for the mysql database
- `password`: password for the mysql database
- `database`: mysql database name
- `website`: provides loyalty bot with an offsite location for checking currency. can also be and be an empty `string`

Optional
- `commands`: enable/disable the ability to use moderator commands. boolean: accepts `true` or `false`

## Preparing your bot
####Create a new bot account

In order to use LoyaltyBot's features you will need to create a new [TwitchTV Account](http://www.twitch.tv/signup). Done?  Cool, now get an oauth password for it.  Paste that into the configuration (look at example.js).

####Subscribers?

All of this functionality is commented out.  I haven't deleted it; but I'm not using it so it doesn't work (or throw errors).

####Setting up MySQL tables

Create the DB, the script will create its own tables; however if by some chance you need to manually setup the tables the following contains information about them:

Viewer
- Table Name: `viewers`
- Field Names: `user` [primary key, not null, varchar], `points` [not null, integer]

Commands
- Table Name: `commands`
- Field Names: `id` [primary key, autoincrement, not null, integer], `command` [not null, text], `text` [not null, longtext], `auth` [default: 1, integer]
