
/**
 * Module dependencies.
 */
require.paths.push('/usr/local/lib/node_modules');
var express = require('express');
var sanitizer = require('sanitizer');
var db = require('./db');
var _=require('underscore');
db.init(function() {
    db.ensureUser('benny@hill.org', 'benny');
    db.ensureUser('johnny@bravo.net', 'johnny');
    db.ensureUser('terry@pratchet.com', 'terry');
    db.ensureUser('sheerun@sher.pl', 'sheerun');
    db.ensureFollower('johnny@bravo.net', 'benny@hill.org');
    db.ensureFollower('johnny@bravo.net', 'terry@pratchet.com');
    db.ensureFollower('benny@hill.org', 'terry@pratchet.com');
    db.ensureFollower('sheerun@sher.pl', 'terry@pratchet.com');

    var err = function(err) {
        console.log(err);
    };
    db.getUserByEmail('johnny@bravo.net', function(user) {
        if (user) {
            db.addTweet(user.id, 'Johhny says hi @' + new Date(), function() {
                console.log("Added tweet " + user.email);
            }, err);
        }
    }, err);
    db.getUserByEmail('benny@hill.org', function(user) {
        if (user) {
            db.addTweet(user.id, 'Benny says hi @' + new Date(), function() {
                console.log("Added tweet " + user.email);
            }, err);
        }
    }, err);
    db.getUserByEmail('terry@pratchet.com', function(user) {
        if (user) {
            db.addTweet(user.id, 'Terry says hi @' + new Date(), function() {
                console.log("Added tweet " + user.email);
            }, err);
        }
    }, err);
	
    var app = module.exports = express.createServer();

    app.configure(function(){
        app.set('views', __dirname + '/views');
        app.set('view engine', 'ejs');
        app.use(express.cookieParser());
        app.use(express.session({
            secret: "muhahahahah"
        }));
        app.use(express.static(__dirname + '/public'));
        app.use(express.bodyParser());
        app.use(express.methodOverride());
        app.use(app.router);
        
    });
	
    app.configure('development', function(){
        app.use(express.errorHandler({
            dumpExceptions: true, 
            showStack: true
        })); 
    });
	
    app.configure('production', function(){
        app.use(express.errorHandler()); 
    });

    // Routes
        
    app.all('*', function(req, res, next){
        var errorFlashes = [];
        var infoFlashes = [];
        
        var parentRender = res.render;
        res.render = function(tpl, data) {
            arguments[1] = arguments[1] || {};
            arguments[1].error = (function() {
                var errors = req.flash('error');
                if (errors.length) {
                    errorFlashes.push.apply(errorFlashes, errors);
                }
                return errorFlashes.join('<br/>');
            })();
            if (!arguments[1].error.length) {
                delete arguments[1].error;
            }
            arguments[1].info = (function(){
                var infos = req.flash('info');
                if (infos.length) {
                    infoFlashes.push.apply(infoFlashes, infos);
                }
                return infoFlashes.join('<br/>');
            })();
            
            if (!arguments[1].info.length) {
                delete arguments[1].info;
            }
            return parentRender.apply(res,_.toArray(arguments));
        }
        if(req.session && req.session.userid) {
            db.getUserById(req.session.userid, function(user) {
                res.local('user', user);
                next();
            });
        } else {
            if (req.url !== '/login') {
                res.redirect('/login');
                return;
            }
            next();
        }
    });
	
    app.get('/', function(req, res, next) {
        var user = res.local('user');
        var followed = user.followed;
        followed.push(user.id);
        db.getTweetsOfUsers(followed, 10, function(tweets) {
            ;
            res.render('tweets', {
                title: 'Tweets',
                tweets: tweets
            });     
        }, function(err) {
            next(err);
        });
    });

    app.get('/logout', function(req, res){
        delete req.session.userid;
        res.redirect('/');
    });
    app.get('/login', function(req, res, next){
        var tplData = {
            title: 'Twitter - Get the fuck sign in'
        };
        res.render('login', tplData);
    });
    
    app.post('/login', function(req, res, next){
        var tplData = {
            title: 'Twitter - Get the fuck sign in',
            content: 'Foobar'
        };
        
        var email = req.param('email');
        var password = req.param('password');
        if (email && password && email.length && password.length && email.indexOf('@') !== -1 && email.indexOf('@') !== 0 && email.indexOf('@') !== (email.length - 1)) {
            tplData.email = email;
            db.getUserByEmail(email, function(user) {
                if (user === null) {
                	db.addUser(email, password, function(user_id) {
                		req.session.userid = user_id;
                		req.flash('info', 'Hello mrs. "' + email + '" :)');
                		res.redirect('/');
                	}, function(err) { next(err); });
                    return;
                }
                if (user.password !== password) {
                    req.flash('error', 'Bad password bitch!');
                    res.render('login', tplData);
                    return;
                }
                
                req.session.userid = user.id;
                req.flash('info', 'Hello mrs. "'+user.email+'" :)');
                res.redirect('/');
            }, function(){
                req.flash('error', 'WAA!!! Everything crash!')
            });
        } else {
            res.render('login', tplData);
        } 
    });

    app.get('/tweets', function(req, res){
        db.getAllTweets(100, function (tweets) { 
            res.render("tweets", {
                tweets: tweets, 
                title: "Tweets"
            });
        }, function () {
            res.redirect('/500');	 
        });
    });
	
    app.post('/tweet', function(req, res){
        var new_tweet = sanitizer.sanitize(req.body.body);
				if (new_tweet.trim().length == 0)
				{
					req.flash('error', "Tweet is empty.");
					res.redirect('/');
					return;
				}
        db.addTweet(res.local("user").id, new_tweet, function () { 
            req.flash('info', 'nigga has been appended to farm');
            res.redirect('/');
        }, function () {
            req.flash('error', "We're sorry, but posting your tweet was unsuccessful");
            res.redirect('/');	 
        });
    });

		app.get('/user/:user_id', function(req, res){
				db.getUserById(req.params.user_id, function(user) {
					db.getTweetsOfUser(req.params.user_id, 100, function (tweets) { 
						res.render("tweets", { 
							tweets: tweets,
							can_follow: res.local('user').followed.indexOf(user.id) === -1,
							title: "Tweets", 
							current_user: user });
					}, function () {
						res.redirect('/500');	 
					});
				});
		});

    app.get('/user/:followee_id/follow', function(req, res){
				if (res.local("user").followed.some ( function (id) { return id == req.params.followee_id } ))
				{
					req.flash('info', "You're already following this user.");
					res.redirect('/user/' + req.params.followee_id);
					return;
				}
        db.followUser(res.local("user").id, req.params.followee_id, function () {
            req.flash('info', 'Watching nigga at work BEGIN!');
						res.redirect('/user/' + req.params.followee_id);
        }, function () {
            req.flash('error', "We're sorry, but attempt to follow '" + req.params.followee_id + "' was unsuccessful");
						res.redirect('/user/' + req.params.followee_id);
        });
    });

    app.get('/user/:followee_id/unfollow', function(req, res){
				if (!res.local("user").followed.some ( function (id) { return id == req.params.followee_id } ))
				{
					req.flash('info', "You have already stopped following this user.");
					res.redirect('/user/' + req.params.followee_id);
					return;
				}
        db.unfollowUser(res.local("user").id, req.params.followee_id, function () {
            req.flash('info', 'Stopping watching nigga at work BEGIN!');
						res.redirect('/user/' + req.params.followee_id);
        }, function () {
            req.flash('error', "We're sorry, but attempt to unfollow '" + req.params.followee_id + "' was unsuccessful");
						res.redirect('/user/' + req.params.followee_id);
        });
    });
	
    app.listen(3000);
    console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
}, function(error) {
    throw error; /* db init failed */
});
