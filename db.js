var mongodb = require('mongodb');
var crypto = require('crypto');
var OID = mongodb.BSONNative.ObjectID;

var db = new mongodb.Db('tweets', new mongodb.Server('127.0.0.1', 27017, {}), {});

var client, users, tweets;

exports.init = function(success_callback, error_callback) {
	db.open(function(error, dbclient) {
		if (error) {
			error_callback(error);
		} else {
			client = dbclient;
			users = new mongodb.Collection(client, 'users');
			tweets = new mongodb.Collection(client, 'tweets');
			success_callback();
		}
	});
};

function logger(name) {
	return function(msg) {
		console.log('[' + new Date() + '] [' + name + '] ' + msg);
	};
}

var user_log = logger('DB users');
var tweet_log = logger('DB tweets');

function insertCallback(callback, error_callback) {
	return function(error, objects) {
		if (error){
			error_callback(error);
		} else {
			var id = objects[0]._id.toString();
			callback(id);
		}
	};
}

/**
 * Callback will receive user_id	
 */
exports.addUser = function(email, password, callback, error_callback) {
	var userHash = crypto.
    	createHash('md5').
    	update(email).
    	digest("hex");
    var gravatar = 'http://gravatar.com/avatar/' + userHash;
	users.insert({
		email: email,
		password: password,
		followed: [],
		gravatar: gravatar
	}, insertCallback(callback, error_callback));
};

function singleEntityCallback(callback, error_callback, format_callback) {
	return function(error, cursor) {
		if (error) {
			error_callback(error);
			return;
		}
		var result = null;
		cursor.each(function(error, doc) {
			if (error) {
				error_callback(error);
			} else if (doc === null) {
				callback(result);
			} else {
				result = format_callback(doc);
			}
		});
	};
}

function formatUser(doc) {
	return {
		email: doc.email,
		password: doc.password,
		id: doc._id.toString(),
		followed: doc.followed,
		gravatar: doc.gravatar
	};
}

/**
 * Callback will receive user object or null
 */
exports.getUserByEmail = function(email, callback, error_callback) {
	users.find({'email': email}, {'limit': 1}, singleEntityCallback(callback, error_callback, formatUser));
};

/**
 * Callback will receive user object or null
 */
exports.getUserById = function(user_id, callback, error_callback) {
	users.find({_id: new OID(user_id)}, {'limit': 1}, singleEntityCallback(callback, error_callback, formatUser));
};

/**
 * Callback will receive tweet object
 */
exports.getTweetById = function(tweet_id, callback, error_callback) {
	tweets.find({_id: new OID(tweet_id)}, {limit: 1}, singleEntityCallback(callback, error_callback, formatTweet));
};

/**
 * Callback will receive array of tweets
 */
exports.getAllTweets = function(limit, callback, error_callback) {
	tweets.find({}, {limit: limit, sort: {ts: -1}}, entitiesCallback(callback, error_callback, formatTweet));
};

function entitiesCallback(callback, error_callback, formatter) {
	return function(error, cursor) {
		if (error) {
			error_callback(error);
			return;
		}
		var results = [];
		cursor.each(function(error, doc) {
			if (error) {
				error_callback(error);
			} else if (doc === null) {
				callback(results);
			} else {
				results.push(formatter(doc));
			}
		});
	};
};

function formatTweet(doc) {
	return {
		id: doc._id.toString(),
		user_id: doc.user_id,
		user_email: doc.user_email,
		user_gravatar: doc.user_gravatar,
		content: doc.content,
		ts: Number(doc.ts)
	};
}

/**
 * Callback will receive array of tweets
 */
exports.getTweetsOfUser = function(user_id, limit, callback, error_callback) {
	tweets.find({user_id: user_id}, {limit: limit, sort: {ts: -1}}, entitiesCallback(callback, error_callback, formatTweet));
};

/**
 * Callback will receive array of tweets
 */
exports.getTweetsOfUsers = function(user_ids, limit, callback, error_callback) {
	tweets.find({user_id: {$in: user_ids}}, {limit: limit, sort: {ts: -1}}, entitiesCallback(callback, error_callback, formatTweet));
};

/**
 * Callback will receive tweet ID
 */
exports.addTweet = function(user_id, tweet_content, callback, error_callback) {
	exports.getUserById(user_id, function(user) {
		if (!user) {
			error_callback('User does not exist');
		} else {
			tweets.insert({
				content: tweet_content,
				user_id: user_id,
				ts: new Date().getTime(),
				user_email: user.email,
				user_gravatar: user.gravatar
			}, insertCallback(callback, error_callback));
		}
	}, error_callback);
};

/**
 * Callback will receive no arguments
 */
exports.followUser = function(follower_user_id, following_user_id, callback, error_callback) {
	exports.getUserById(follower_user_id, function(user) {
		if (!user) {
			error_callback('User not found');
			return;
		}
		user.followed.push(following_user_id);
		users.update({_id: new OID(user.id)}, {
			_id: new OID(user.id),
			email: user.email,
			password: user.password,
			followed: user.followed,
			gravatar: user.gravatar
		}, function(error) {
			if (error) {
				error_callback(error);
			} else {
				callback();
			}
		});
	}, error_callback);
};

/**
 * Callback will receive no arguments
 */
exports.unfollowUser = function(follower_user_id, following_user_id, callback, error_callback) {
	exports.getUserById(follower_user_id, function(user) {
		if (!user) {
			error_callback('User not found');
			return;
		}
		if (user.followed.indexOf(following_user_id) === -1) {
			error_callback('User is not followed');
			return;
		}
		user.followed = user.followed.filter(function(i) {return i !== following_user_id;});
		users.update({_id: new OID(user.id)}, {
			_id: new OID(user.id),
			email: user.email,
			password: user.password,
			followed: user.followed,
			gravatar: user.gravatar
		}, function(error) {
			if (error) {
				error_callback(error);
			} else {
				callback();
			}
		});
	}, error_callback);
};

var nop = function() {};
var raise = function(err) { throw err; }
exports.ensureUser = function(email, password, callback) {
	callback = callback || nop;
	exports.getUserByEmail(email, function(user) {
		if (user) {
			console.log('User ' + email + ' already exists');
		} else {
			exports.addUser(email, password, function(user_id) {
				console.log('User ' + email + ' added');
			}, raise);
		}
	}, raise);
};

exports.ensureFollower = function(follower_email, following_email, callback) {
	callback = callback || nop;
	exports.getUserByEmail(follower_email, function(follower) {
		if (!follower) {
			return raise("Follower not found");
		}
		exports.getUserByEmail(following_email, function(following) {
			if (!following) {
				return raise("Following not found");
			}
			if (follower.followed.indexOf(following.id) !== -1) {
				console.log('Already following');
			} else {
				exports.followUser(follower.id, following.id, function() {
					console.log('Added follower');
					callback();
				}, raise);
			}
		}, raise);
	}, raise);
};