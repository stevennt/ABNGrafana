import './modal_ctrl';
import {QueryType} from './constants';
import {QueryCtrl} from 'app/plugins/sdk';
import appEvents from 'app/core/app_events';
import _ from 'lodash';

export class OpenNMSQueryCtrl extends QueryCtrl {
  /** @ngInject */
  constructor($rootScope, $scope, $injector, $q, $modal) {
    super($scope, $injector);

    this.types = QueryType;

    this.error = this.validateTarget();
    this.$rootScope = $rootScope;
    this.$q = $q;
    this.$modal = $modal;
  }

  openNodeSelectionModal() {
    var self = this;
    this.showSelectionModal("nodes", {
      '#': 'id',
      'Label': 'label',
      'Foreign ID': 'foreignId',
      'sysName': 'sysName'
    }, function (query, offset) {
      return self.datasource
        .searchForNodes(query, offset)
        .then(function (results) {
          return {
            'count': results.data.count,
            'totalCount': results.data.totalCount,
            'rows': results.data.node
          };
        });
    }, function (node) {
      if (!_.isUndefined(node.foreignId) && !_.isNull(node.foreignId) &&
        !_.isUndefined(node.foreignSource) && !_.isNull(node.foreignSource)) {
        // Prefer fs:fid
        self.target.nodeId = node.foreignSource + ":" + node.foreignId;
      } else {
        // Fallback to node id
        self.target.nodeId = node.id;
      }
      self.targetBlur('nodeId');
    });
  }

  openResourceSelectionModal() {
    var self = this;

    function filterResources(resources, query) {
      var filteredResources = resources;
      if (query.length >= 1) {
        query = query.toLowerCase();
        filteredResources = _.filter(resources, function (resource) {
          return resource.key.indexOf(query) >= 0;
        });
      }

      // Passing All Filtered Resources to Modal - Pagination will be applied
      return {
        'totalCount': filteredResources.length,
        'rows': filteredResources
      };
    }

    self.nodeResources = undefined;
    this.showSelectionModal("resources", {
      'Label': 'label',
      'Name': 'name'
    }, function (query) {
      if (self.nodeResources !== undefined) {
        var deferred = self.$q.defer();
        deferred.resolve(filterResources(self.nodeResources, query));
        return deferred.promise;
      }

      return self.datasource.getResourcesWithAttributesForNode(self.target.nodeId)
        .then(function (resources) {
          // Compute a key for more efficient searching
          _.each(resources, function (resource) {
            resource.key = resource.label.toLowerCase() + resource.name.toLowerCase();
          });
          // Sort the list once
          self.nodeResources = _.sortBy(resources, function (resource) {
            return resource.label;
          });
          // Filter
          return filterResources(self.nodeResources, query);
        });
    }, function (resource) {
      // Exclude the node portion of the resource id
      var re = /node(Source)?\[.*?]\.(.*)$/;
      var match = re.exec(resource.id);
      self.target.resourceId = match[2];
      self.targetBlur('resourceId');
    });
  }

  openAttributeSelectionModal(prop) {
    var self = this;

    if (!prop) {
      prop = 'attribute';
    }

    this.showSelectionModal("attributes", {
      'Name': 'name'
    }, function (query) {
      return self.datasource
        .suggestAttributes(self.target.nodeId, self.target.resourceId, query)
        .then(function (attributes) {
          var namedAttributes = [];
          _.each(attributes, function (attribute) {
            namedAttributes.push({'name': attribute});
          });

          return {
            'totalCount': namedAttributes.length,
            'rows': namedAttributes
          };
        });
    }, function (attribute) {
      self.target[prop] = attribute.name;
      self.targetBlur(prop);
    });
  }

  openFilterSelectionModal() {
    var self = this;
    this.showSelectionModal("filters", {
      'Name': 'name',
      'Description': 'description',
      'Backend': 'backend'
    }, function () {
      return self.datasource
        .getAvailableFilters()
        .then(function (results) {
          return {
            'totalCount': results.data.length,
            'rows': results.data
          };
        });
    }, function (filter) {
      self.target.filter = filter;
      self.targetBlur('filter');
    });
  }

  showSelectionModal(label, columns, search, callback) {
    var scope = this.$rootScope.$new();

    scope.label = label;
    scope.columns = columns;
    scope.search = search;

    scope.result = this.$q.defer();
    scope.result.promise.then(callback);

    var modal = this.$modal({
      template: 'public/plugins/opennms-helm-app/datasources/perf-ds/partials/modal.selection.html',
      persist: false,
      show: false,
      scope: scope,
      keyboard: false
    });
    this.$q.when(modal).then(function (modalEl) { modalEl.modal('show'); });
  }

  targetBlur(targetId, required) {
    if (required === undefined) {
      required = true;
    }
    var errorMessage = this.validateTarget(targetId, required);
    if (errorMessage) {
      appEvents.emit('alert-error', ['Error', errorMessage]);
      this.error = errorMessage;
    } else {
      // Only send valid requests to the API
      this.refresh();
    }
  }

  validateTarget(targetId, required) {
    // console.log('validateTarget(' + targetId + ',' + required + ')', this.target);
    if (this.target.type === QueryType.Attribute || this.target.type === QueryType.Expression) {
      var messages = {
        'nodeId': "You must supply a node id.",
        'resourceId': "You must supply a resource id.",
        'attribute': "You must supply an attribute.",
        'expression': "You must supply an expression.",
        'label': "You must supply a label."
      };
      if (required && targetId in messages && !this.target[targetId]) {
        return messages[targetId];
      } else if (required && !this.target[targetId]) {
        // Fallback error message if the targetId doesn't have a specific message defined
        return targetId + ' is a required field.';
      }
    } else if (this.target.type === QueryType.Filter) {
      if (targetId === 'filterName') {
        if (!this.target.filter || this.target.filter && (!this.target.filter.name || this.target.filter.name.trim().length === 0)) {
          return "You must select a filter.";
        }
      } else if (targetId !== 'type' && required && (!this.target.filterParameters || !(targetId in this.target.filterParameters) || !this.target.filterParameters[targetId])) {
        return targetId + ' is a required field.';
      }
    }
    return null;
  }

  getCollapsedText() {
    if (this.target.type === QueryType.Attribute) {
      return "Attribute: " + this.target.attribute;
    } else if (this.target.type === QueryType.Expression) {
      return "Expression: " + this.target.label;
    } else if (this.target.type === QueryType.Filter) {
      return "Filter: " + this.target.filter.name;
    } else {
      return "<Incomplete>";
    }
  }
}

OpenNMSQueryCtrl.templateUrl = 'datasources/perf-ds/partials/query.editor.html';
