import {QueryType} from './constants';
import {interpolate} from "./interpolate";
import _ from 'lodash';
import {FunctionFormatter} from '../../lib/function_formatter';

export class OpenNMSDatasource {
  /** @ngInject */
  constructor(instanceSettings, $q, backendSrv, templateSrv) {
    this.type = instanceSettings.type;
    this.url = instanceSettings.url;
    this.name = instanceSettings.name;
    this.basicAuth = instanceSettings.basicAuth;
    this.withCredentials = instanceSettings.withCredentials;
    // This variable is referenced by the calculateInterval() method in metrics_panel_ctrl.ts
    this.interval = (instanceSettings.jsonData || {}).timeInterval;

    if (instanceSettings.jsonData && instanceSettings.jsonData.timeout) {
        this.timeout = parseInt(instanceSettings.jsonData.timeout,10) * 1000;
    }

    this.$q = $q;
    this.backendSrv = backendSrv;
    this.templateSrv = templateSrv;

    this.searchLimit = 25;
    this.target = {};
  }

  doOpenNMSRequest(options) {
    if (this.basicAuth || this.withCredentials) {
      options.withCredentials = true;
    }
    if (this.basicAuth) {
      options.headers = options.headers || {};
      options.headers.Authorization = this.basicAuth;
    }

    options.url = this.url + options.url;
    if (this.timeout) {
      options.timeout = this.timeout;
    }

    return this.backendSrv.datasourceRequest(options);
  }

  decorateError(err) {
    let ret = err;
    if (err.err) {
      ret = err.err;
    }
    let statusText = ret.statusText || 'Request failed.';

    // cancelled property causes the UI to never complete on failure
    if (ret.cancelled) {
      delete ret.cancelled;
      statusText = 'Request timed out.';
    }
    if (err.cancelled) {
      delete err.cancelled;
      statusText = 'Request timed out.';
    }

    if (!ret.message) {
      ret.message = statusText;
    }
    if (!ret.status) {
      ret.status = 'error';
    }
    return ret;
  }

  query(options) {
    const self = this;

    // Generate the query
    var [query, labels] = this.buildQuery(options);

    // Issue the request
    var request;
    if (query.source.length > 0) {
      request = this.doOpenNMSRequest({
        url: '/rest/measurements',
        data: query,
        method: 'POST',
        headers: {'Content-Type': 'application/json'}
      });
    } else {
      // There are no sources listed, let Grafana display "No data points" to the user
      return this.$q.when({ data: [] });
    }

    return request
      // Convert the results to the expected format
      .then((response) => {
        if (response.status < 200 || response.status >= 300) {
          console.warn('Response code:',response);
          return self.$q.reject(response);
        }

        return OpenNMSDatasource.processMeasurementsResponse(response);
      })
      // Sort resulting series by labels
      .then((result) => {
          result.data = _.sortBy(result.data, (s) => _.indexOf(labels, s.label));
          return result;
      })
      .catch(err => {
        return self.$q.reject(self.decorateError(err));
      });
  }

  // Used for testing the connection from the datasource configuration page
  testDatasource() {
    return this.doOpenNMSRequest({
      url: '/rest/info',
      method: 'GET'
    }).then(response => {
      if (response.status === 200) {
        return {status: "success", message: "Data source is working", title: "Success"};
      } else {
        return {
          status: "danger",
          message: "OpenNMS provided a response, but no metadata was found.",
          title: "Unexpected Response " + response.status
        };
      }
    }).catch(err => {
      return this.decorateError(err);
    });
  }

  // Used by template queries
  metricFindQuery(query) {
    if (query === null || query === undefined || query === "") {
      return this.$q.resolve([]);
    }

    var interpolatedQuery = _.first(this.interpolateValue(query));

    if (interpolatedQuery !== undefined) {
      const functions = FunctionFormatter.findFunctions(interpolatedQuery);

      for (const func of functions) {
        if (func.name === 'nodeFilter') {
          return this.metricFindNodeFilterQuery.apply(this, func.arguments);
        } else if (func.name === 'nodeResources') {
          return this.metricFindNodeResourceQuery.apply(this, func.arguments);
        } else {
          console.warn('Unknown function in interpolated query: ' + interpolatedQuery, func);
        }
      }
    }

    return this.$q.resolve([]);
  }

  metricFindNodeFilterQuery(query) {
    return this.doOpenNMSRequest({
      url: '/rest/nodes',
      method: 'GET',
      params: {
        filterRule: query,
        limit: 0
      }
    }).then(function (response) {
      if (response.data.count > response.data.totalCount) {
        console.warn("Filter matches " + response.data.totalCount + " records, but only " + response.data.count + " will be used.");
      }
      var results = [];
      _.each(response.data.node, function (node) {
        var nodeCriteria = node.id.toString();
        if (node.foreignId !== null && node.foreignSource !== null) {
          nodeCriteria = node.foreignSource + ":" + node.foreignId;
        }
        results.push({text: node.label, value: nodeCriteria, expandable: true});
      });
      return results;
    });
  }

  metricFindNodeResourceQuery(query) {
    return this.doOpenNMSRequest({
      url: '/rest/resources/' + encodeURIComponent(OpenNMSDatasource.getNodeResource(query)),
      method: 'GET',
      params: {
        depth: 1
      }
    }).then(function (response) {
      var results = [];
      _.each(response.data.children.resource, function (resource) {
        var resourceWithoutNodePrefix = resource.id.match(/node(Source)?\[.*?\]\.(.*)/);
        if (resourceWithoutNodePrefix) {
          results.push({text: resourceWithoutNodePrefix[2], expandable: true});
        }
      });
      return results;
    });
  }

  buildQuery(options) {
    const maxDataPoints = options.maxDataPoints || 300;
    const intervalMs = options.intervalMs || 60 * 1000;

    var self = this,
      start = options.range.from.valueOf(),
      end = options.range.to.valueOf(),
      step = Math.floor((end - start) / maxDataPoints);
      step = (step < intervalMs) ? intervalMs : step;

    var query = {
      "start": start,
      "end": end,
      "step": step,
      "relaxed": true, // enable relaxed mode, which allows for missing attributes
      "maxrows": maxDataPoints,
      "source": [],
      "expression": []
    };

    var labels = [];

    _.each(options.targets, function (target) {
      var transient = "false";
      if (target.hide) {
        transient = true;
      }

      if (target.type === QueryType.Attribute) {
        if (!((target.nodeId && target.resourceId && target.attribute))) {
          return;
        }

        var label = target.label;
        if (label === undefined || label === '') {
          label = target.attribute;
        }

        // Build the source
        let source = {
          "aggregation": target.aggregation,
          "attribute": target.attribute,
          "label": label,
          "resourceId": target.resourceId,
          "nodeId": target.nodeId, // temporary attribute used for interpolation
          "transient": transient
        };

        if (target.subattribute !== undefined && target.subattribute !== '') {
          source.datasource = target.subattribute;
        }
        if (target.fallbackAttribute !== undefined && target.fallbackAttribute !== '') {
          source['fallback-attribute'] = target.fallbackAttribute;
        }

        // Perform variable substitution - may generate additional queries
        source = self.interpolateSourceVariables(source, options.scopedVars, (interpolatedSource) => {
            // Calculate the effective resource id after the interpolation
            interpolatedSource.resourceId = OpenNMSDatasource.getRemoteResourceId(interpolatedSource.nodeId, interpolatedSource.resourceId);
            delete interpolatedSource.nodeId;
        });
        query.source = query.source.concat(source);

        labels = labels.concat(_.map(source, 'label'));

      } else if (target.type === QueryType.Expression) {
        if (!((target.label && target.expression))) {
          return;
        }

        // Build the expression
        let expression = {
          "label": target.label,
          "value": target.expression,
          "transient": transient
        };

        // Perform variable substitution - may generate additional expressions
        expression = self.interpolateExpressionVariables(expression, options.scopedVars);
        query.expression = query.expression.concat(expression);

        labels = labels.concat(_.map(expression, 'label'));

      } else if (target.type === QueryType.Filter) {
        if (!((target.filter))) {
          return;
        }

        // Interpolate the filter parameters
        var interpolatedFilterParms = self.interpolateVariables(target.filterParameters, _.keys(target.filterParameters), options.scopedVars);

        var filters = _.map(interpolatedFilterParms, (filterParms) => {
          // Build the filter definition
          var parameters = [];
          _.each(filterParms, function (value, key) {
            // Skip parameters with undefined or empty values
            if (value === undefined || value === '' || value === null) {
              return;
            }

            parameters.push({
              'key': key,
              'value': value
            });
          });

          return {
            "name": target.filter.name,
            "parameter": parameters
          };
        });

        // Only add the filter attribute to the query when one or more filters are specified since
        // OpenNMS versions before 17.0.0 do not support it
        if (!query.filter) {
          query.filter = filters;
        } else {
          query.filter = query.filter.concat(filters);
        }
      }
    });

    return [query, labels];
  }

  interpolateSourceVariables(source, scopedVars, callback) {
    return this.interpolateVariables(source, ['nodeId', 'resourceId', 'attribute', 'datasource', 'label'], scopedVars, callback);
  }

  interpolateExpressionVariables(expression, scopedVars) {
    return this.interpolateVariables(expression, ['value', 'label'], scopedVars);
  }

  interpolateValue(value, scopedVars) {
    return _.map(this.interpolateVariables({'value': value}, ['value'], scopedVars), function(entry) {
      return entry.value;
    });
  }

  interpolateVariables(object, attributes, scopedVars, callback) {
    // Reformat the variables to work with our interpolate function
    var variables = [];
    _.each(this.templateSrv.variables, function(templateVariable) {
      var variable = {
        name: templateVariable.name,
        value: []
      };

      // If this templateVar exists in scopedVars, we need to look at the scoped values
      if (scopedVars && scopedVars[variable.name] !== undefined) {
        variable.value.push(scopedVars[variable.name].value);
      } else {
        // Single-valued?
        if (_.isString(templateVariable.current.value)) {
          variable.value.push(templateVariable.current.value);
        } else {
          _.each(templateVariable.current.value, function(value) {
            if (value === "$__all") {
              _.each(templateVariable.options, function(option) {
                // "All" is part of the options, so make sure to skip that one
                if (option.value !== "$__all") {
                  variable.value.push(option.value);
                }
              });
            } else {
              variable.value.push(value);
            }
          });
        }
      }

      variables.push(variable);
    });
    return interpolate(object, attributes, variables, callback);
  }

  static processMeasurementsResponse(response) {
    var labels = response.data.labels;
    var columns = response.data.columns;
    var timestamps = response.data.timestamps;
    var metadata = response.data.metadata;
    var series = [];
    var i, j, nRows, nCols, datapoints;
    var value, atLeastOneNonNaNValue;

    if (timestamps !== undefined) {
      nRows = timestamps.length;
      nCols = columns.length;

      for (i = 0; i < nCols; i++) {
        atLeastOneNonNaNValue = false;
        datapoints = [];
        for (j = 0; j < nRows; j++) {
          // Skip rows that are out-of-ranges - this can happen with RRD data in narrow time spans
          if (timestamps[j] < response.data.start || timestamps[j] > response.data.end) {
            continue;
          }

          value = columns[i].values[j];
          // Replace literal 'NaN' values with nulls
          if (value === 'NaN') {
            value = null;
          }

          if (!atLeastOneNonNaNValue && !isNaN(value)) {
            atLeastOneNonNaNValue = true;
          }
          datapoints.push([value, timestamps[j]]);
        }

        let label = labels[i];
        if (metadata && metadata.resources) {
          label = FunctionFormatter.format(label, metadata);
        }

        // Skip series that are all NaNs
        // When querying in relaxed mode, expressions that operate against attribute that are missing may only contain
        // NaNs. In this case, we don't want to show them at all.
        if (atLeastOneNonNaNValue) {
          series.push({
            target: label,
            label: labels[i],
            datapoints: datapoints
          });
        }
      }
    }

    return {data: series};
  }

  static flattenResourcesWithAttributes(resources, resourcesWithAttributes) {
    _.each(resources, function (resource) {
      if (resource.rrdGraphAttributes !== undefined && Object.keys(resource.rrdGraphAttributes).length > 0) {
        resourcesWithAttributes.push(resource);
      }
      if (resource.children !== undefined && resource.children.resource.length > 0) {
        OpenNMSDatasource.flattenResourcesWithAttributes(resource.children.resource, resourcesWithAttributes);
      }
    });
    return resourcesWithAttributes;
  }

  static getNodeResource(nodeId) {
    var prefix = "";
    if (nodeId.indexOf(":") > 0) {
      prefix = "nodeSource[";
    } else {
      prefix = "node[";
    }
    return prefix + nodeId + "]";
  }

  static getRemoteResourceId(nodeId, resourceId) {
    return OpenNMSDatasource.getNodeResource(nodeId) + "." + resourceId;
  }

  searchForNodes(query, offset) {
    return this.doOpenNMSRequest({
      url: '/rest/nodes',
      method: 'GET',
      params: {
        offset: offset,
        limit: this.searchLimit,
        match: 'any',
        comparator: 'ilike',
        orderBy: 'id',
        order: 'asc',
        label: '%' + query + '%',
        sysName: '%' + query + '%',
        'ipInterface.ipAddress': '%' + query + '%',
        'ipInterface.ipHostName': '%' + query + '%',
        'foreignId': query + '%' // doesn't support leading '%'
      }
    });
  }

  getResourcesWithAttributesForNode(nodeId) {
    var interpolatedNodeId = _.first(this.interpolateValue(nodeId));

    return this.doOpenNMSRequest({
      url: '/rest/resources/fornode/' + encodeURIComponent(interpolatedNodeId),
      method: 'GET',
      params: {
        depth: -1
      }
    }).then(function (results) {
      return OpenNMSDatasource.flattenResourcesWithAttributes([results.data], []);
    });
  }

  getAvailableFilters() {
    return this.doOpenNMSRequest({
      url: '/rest/measurements/filters',
      method: 'GET'
    });
  }

  suggestAttributes(nodeId, resourceId, query) {
    var interpolatedNodeId = _.first(this.interpolateValue(nodeId)),
        interpolatedResourceId = _.first(this.interpolateValue(resourceId));
    var remoteResourceId = OpenNMSDatasource.getRemoteResourceId(interpolatedNodeId, interpolatedResourceId);

    return this.doOpenNMSRequest({
      url: '/rest/resources/' + encodeURIComponent(remoteResourceId),
      method: 'GET',
      params: {
        depth: -1
      }
    }).then(function (results) {
      query = query.toLowerCase();
      var attributes = [];
      _.each(results.data.rrdGraphAttributes, function (value, key) {
        if (key.toLowerCase().indexOf(query) >= 0) {
          attributes.push(key);
        }
      });
      attributes.sort();

      return attributes;
    });
  }
}
