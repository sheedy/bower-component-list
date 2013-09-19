/*jshint camelcase:false */
'use strict';
var request = require('request');
var Q = require('q');
var cachedResults;

var REGISTRY_URL = 'https://bower.herokuapp.com/packages';

function createComponentData(name, data) {
	return {
		name: name,
		description: data.description,
		owner: data.owner.login,
		website: data.html_url,
		forks: data.forks,
		stars: data.watchers,
		created: data.created_at,
		updated: data.pushed_at
	};
}

function fetchComponents() {
	return Q.fcall(function () {
		var deferred = Q.defer();
		request.get(REGISTRY_URL, {json: true, timeout: 60000}, function(err, response, body) {
			if (!err && response.statusCode === 200) {
				deferred.resolve(body);
			} else {
				console.log('err bower registry', err, response, body);
				deferred.reject(new Error(err));
			}
		});
		return deferred.promise;
	}).then(function (list) {
		var apiLimitExceeded = false;
		var results = list.map(function (el) {
			var deferred = Q.defer();
			var re = /github\.com\/([\w\-\.]+)\/([\w\-\.]+)/i;
			var parsedUrl = re.exec(el.url.replace(/\.git$/, ''));

			// only return components from github
			if (!parsedUrl) {
				deferred.resolve();
				return deferred.promise;
			}

			var user = parsedUrl[1];
			var repo = parsedUrl[2];
			var apiUrl = 'https://api.github.com/repos/' + user + '/' + repo;

			request.get(apiUrl, {
				json: true,
				qs: {
					client_id: process.env.GITHUB_CLIENT_ID,
					client_secret: process.env.GITHUB_CLIENT_SECRET
				},
				headers: {
					'User-Agent': 'Node.js'
				},
				timeout: 60000
			}, function (err, response, body) {
				if (!err && body && /API Rate Limit Exceeded/.test(body.message)) {
					apiLimitExceeded = true;
					deferred.resolve();
				} else if (/Repository access blocked/.test(body.message)) {
					deferred.resolve();
				} else if (!err && response.statusCode === 200) {
					deferred.resolve(createComponentData(el.name, body));
				} else {
					if (response && response.statusCode === 404) {
						deferred.resolve();
					} else {
						console.log('err github fetch', err, body, response);
						deferred.resolve();
					}
				}
				return deferred.promise;
			});
			return deferred.promise;
		});

		if (apiLimitExceeded) {
			console.log('API limit exceeded. Using cached GitHub results.');
			return Q.all(cachedResults);
		}

		cachedResults = results;

		console.log('Finished fetching data from Bower registry', '' + new Date());
		return Q.all(results);
	});
}

module.exports = fetchComponents;
