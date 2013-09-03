'use strict';
var crypto = require('crypto');
var connect = require('connect');
var Q = require('q');
var fetchComponents = require('./component-list');

var componentListEntity;
var entity;

var HTTP_PORT = process.env.PORT || 8011;
var UPDATE_INTERVAL_IN_MINUTES =  480;


function getComponentListEntity() {
	var deferred = Q.defer();

	fetchComponents().then(function (list) {
		console.log('Finished fetching data from GitHub', '' + new Date());

		// TODO: Find a way for the promise not to return null so this isn't needed
		list = list.filter(function (el) {
			return el !== null && el !== undefined;
		});

		entity = {json: JSON.stringify(list)};
		var shasum = crypto.createHash('sha1');
		shasum.update(entity.json);
		entity.etag = shasum.digest('hex');
		deferred.resolve(entity);
		// update the entity
		componentListEntity = deferred.promise;
	}).fail(function (err) {
		console.log('fetchComponents error', err);
		if (entity) {
			deferred.resolve(asset);
		} else {
			deferred.reject(err);
		}
	});

	return deferred.promise;
}

function getComponentList(request, response, next) {
	componentListEntity.then(function (entity) {
		// allow CORS
		response.setHeader('ETag', entity.etag);
		response.setHeader('Access-Control-Allow-Origin', '*');
		response.setHeader('Content-Type', 'application/json');

		if (request.headers['if-none-match'] === entity.etag) {
			response.statusCode = 304;
			response.end();
			return;
		}

		response.statusCode = 200;
		response.end(new Buffer(entity.json));
	}).fail(function (err) {
		console.error('' + new Date(), 'Failed serving componentListEntity', err);
		next(err);
	});
}

// componentListEntity - promise {etag: '', json: ''}
// using a promise so that clients can connect and wait for the initial entity
componentListEntity = getComponentListEntity();

connect()
	.use(connect.errorHandler())
	.use(connect.timeout(20000))
	.use(connect.logger('dev'))
	.use(connect.compress())
	.use(getComponentList)
	.listen(HTTP_PORT);

setInterval(getComponentListEntity, UPDATE_INTERVAL_IN_MINUTES * 1000 * 60);

console.log('Server running on port ' + HTTP_PORT);
