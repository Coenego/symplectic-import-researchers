#!/usr/bin/env node

var _ = require('underscore');
var fs = require('fs');
var request = require('request');
var util = require('util');
var xml2js = require('xml2js');

// Cache the departments and their researchers
var departments = {};

/**
 * Imports all the researchers from Symplectic
 */
var importResearchers = function() {

    // Create a new XML parser
    var parser = new xml2js.Parser({'explicitArray': true});

    /*!
     * @param  {Number}     page    The page to fetch
     */
    var _importResearchers = function(page) {

        // Construct the request url
        var url = util.format('https://ref.cam.ac.uk:8091/publications-api/v4.6/users?detail=full&page=%d', page);

        // Send a request to the Symplectic API
        request({'url': url}, function(err, response, body) {
            if (err) {
                console.error('An error occurred while fetching Symplectic data');
            }

            // Parse the response body
            parser.parseString(body, function(err, xml) {

                // Fetch the pagination data from the XML
                var pagination = _getPagination(xml);

                console.log('Fetching page ' + page + '/' + pagination.pages);

                // Check if results are returned
                if (xml.feed['api:pagination'][0]['$']['results-count'] !== '0') {

                    // Check if the Symplectic API threw an error
                    if (xml.feed.entry[0]['api:error']) {
                        console.log('An error occurred while fetching Symplectic data');
                    }

                    // Parse the researchers
                    _.each(xml.feed.entry, function(entry) {

                        // Fetch the researcher's department
                        var department = entry['api:object'][0]['api:primary-group-descriptor'];

                        // Create a department specific array
                        if (!departments[department]) {
                            departments[department] = [];
                        }

                        // Create a reseacher object
                        var researcher = {
                            'id': entry['api:object'][0]['$']['username'],
                            'name': entry['title'][0],
                            'email': entry['api:object'][0]['api:email-address']
                        };

                        // Add the researcher to the department array
                        departments[department].push(researcher);
                    });

                    // Handle the pagination
                    if (page === pagination.pages) {
                        return exportResearchers();

                    } else {
                        page++;

                        // Symplectic explicitly states that you shouldn't hammer their API with requests and demands that you wait a minimum of half a second between requests
                        setTimeout(_importResearchers, 500, page);
                    }
                }
            });
        });
    };

    _importResearchers(1);
};

/**
 * Exports the list of researchers
 */
var exportResearchers = function() {

    var data = '';

    // Loop all the departments
    _.each(departments, function(researchers, department) {

        // Loop all the researchers
        _.each(researchers, function(researcher) {

            var id = researcher.id;
            var name = researcher.name.replace(',', '');
            var email = researcher.email;

            // Add the researcher to the file
            data += util.format('%s,%s,%s,%s,\n', id, name, email, department);
        });
    });

    fs.appendFile('researchers.txt', data, function(err) {
        if (err) {
            console.log('Error while exporting researchers');
        }
        console.log('Successfully exported researchers');
    });
};

/**
 * Takes the XML object and returns a pagination object
 *
 * @param  {Object}     xml     The XML object that contains the pagination data
 * @return {Object}             An object containing the keys: `total` which holds the total number of users/publications and `pages` which holds the total number of pages for this request
 * @api private
 */
var _getPagination = function(xml) {
    var nrOfPages = 0;
    var lastPage = _.find(xml.feed['api:pagination'][0]['api:page'], function(page) { return page['$']['position'] === 'last'; });
    if (lastPage) {
        nrOfPages = parseInt(lastPage['$']['number'], 10);
    }

    return {
        'total': xml.feed['api:pagination'][0]['$']['results-count'],
        'pages': nrOfPages
    };
};

importResearchers();
