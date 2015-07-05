var fs = require('fs');
var path = require('path');
var util = require('util');
var glob = require('glob').sync;
var TelegramBot = require('node-telegram-bot-api');

// Config
var token = '116758249:AAE2_Ho4qepRP3NmDFSwpIINLXh6Y7Q6e_g';
var soundsPath = path.join(__dirname, './sounds/');

// ---------------------
var mongoose = require('mongoose');
var db = mongoose.connect('mongodb://localhost/soundboard');
var UserState = db.model('UserState', {
	user_id: Number,
	state: String,
	arguments: [ String ]
});
var UserSounds = db.model('UserSounds', {
	user_id: Number,
	name: String,
	file_id: String
});
// ----------------------

var Messages = {
	greet: 'Hi! I\'m your Custom Sound Board Bot.\n' + 
			'\n' +
			'I can keep a record of your sounds and then use them in groups where I\'m invited.\n' + 
			'\n' +
			'You can use the following commands in a chat with me for setting up your soundboard\n' + 
			'\n' +
			'/record - Create or edit a sound.\n' + 
			'/play [name] - Plays an existing sound from your personal soundboard.\n' +
			'/list - Shows a list of all your recorded sounds',
	record_name: 'How do you want to call this sound?\nYou can use a-z and _ in it.',
	record_audio: 'Now send me the audio. It can be a file or a voice recording.',
	record_done: 'Done. You have succesfully created a new sound. You can invoke it using "/play %s" or "/%s"'
}

var States = {
	greet: 'greet',
	record_name: 'record_name',
	record_audio: 'record_audio',
	record_done: 'record_done'
};

// Program params
var bot = new TelegramBot(token, {polling: true});
bot.on('message', function (msg) {
	console.log(msg);

	if (msg.from && msg.text && /^\//.test(msg.text)) {
		var text = msg.text.substring(1);
		var cmd = text.split(' ');
		var soundName = cmd[0];

		if (soundName == 'play')
			soundName = cmd[1];

		UserSounds
		.find{ name: soundName })
		.then(function(sounds) {
			if (sounds.length > 0) {
				var sound = sounds[Math.floor(Math.random() * sound.length)];
				return bot.sendAudio(msg.chat.id, sound.file_id);
			}

			handleUserProcess(msg);
		})
	}
	else
		handleUserProcess(msg);
})

var handleUserProcess = function(msg) {

	if (!(msg.from && msg.chat && msg.from.id == msg.chat.id))
		return;

	UserState
	.findOne({ user_id: msg.from.id })
	.then(function (user_state) {
		if (user_state != null)
			return user_state;

		return UserState.create({ user_id: msg.from.id, state: States.greet })
	})
	.then(function (user_state) {
		var status = user_state.state;

		if (msg.text && msg.text == '/list') {
			UserSounds
			.aggregate(
				{ $group: 
					{ _id: 'name', count: { $sum: 1 } } 
				}
			)
			.then(function (sounds) {
				var text = sounds.map(function(s) { return util.format('%s : %d\n', s._id, s.count)});
				return bot.sendMessage(msg.chat.id, text);
			})
			return null;
		}

		if (msg.text && msg.text == '/record') {
			user_state.state = States.record_name;
			user_state.save();
			return user_state;
		}

		if (status == States.record_name && msg.text) {
			user_state.state = States.record_audio;
			user_state.arguments.push(msg.text.split(' ')[0].toLowerCase());
			user_state.save();
			return user_state;
		}

		if (status == States.record_audio && msg.audio) {
			var soundname =  user_state.arguments[0];
			return UserSounds
			.findOne({ user_id: msg.from.id, name: soundname, file_id: msg.audio.file_id })
			.then(function (soundentry) {

				if (soundentry) {
					soundentry.file_id = msg.audio.file_id;
					return soundentry.save();
				}
				else {
					UserSounds.create({ user_id: msg.from.id, file_id: msg.audio.file_id, name: soundname })
				}
			})
			.then(function () {
				user_state.state = States.record_done;
				user_state.arguments = [ soundname ];
				user_state.save();
				return user_state;
			})
		}

		user_state.state = States.greet;
		user_state.arguments = [];
		user_state.save();
		return user_state;
	})
	.then(function (user_state) {
		if (user_state == null)
			return;

		if (user_state.state == States.record_name)
			return bot.sendMessage(msg.chat.id, Messages.record_name);

		if (user_state.state == States.record_audio)
			return bot.sendMessage(msg.chat.id, Messages.record_audio);

		if (user_state.state == States.record_done) {
			var soundname = user_state.arguments[0];
			user_state.state = States.greet;
			user_state.arguments = [];
			user_state.save();
			return bot.sendMessage(msg.chat.id, util.format(Messages.record_done, soundname, soundname));
		}

		return bot.sendMessage(msg.chat.id, Messages.greet);
	})
}