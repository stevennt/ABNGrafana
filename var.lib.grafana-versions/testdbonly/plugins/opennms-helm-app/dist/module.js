define(["@grafana/ui","@grafana/data"],(function(t,n){return function(t){var n={};function e(o){if(n[o])return n[o].exports;var r=n[o]={i:o,l:!1,exports:{}};return t[o].call(r.exports,r,r.exports,e),r.l=!0,r.exports}return e.m=t,e.c=n,e.d=function(t,n,o){e.o(t,n)||Object.defineProperty(t,n,{enumerable:!0,get:o})},e.r=function(t){"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(t,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(t,"__esModule",{value:!0})},e.t=function(t,n){if(1&n&&(t=e(t)),8&n)return t;if(4&n&&"object"==typeof t&&t&&t.__esModule)return t;var o=Object.create(null);if(e.r(o),Object.defineProperty(o,"default",{enumerable:!0,value:t}),2&n&&"string"!=typeof t)for(var r in t)e.d(o,r,function(n){return t[n]}.bind(null,r));return o},e.n=function(t){var n=t&&t.__esModule?function(){return t.default}:function(){return t};return e.d(n,"a",n),n},e.o=function(t,n){return Object.prototype.hasOwnProperty.call(t,n)},e.p="",e(e.s=2)}([function(t,n){t.exports=function(t,n){if(!(t instanceof n))throw new TypeError("Cannot call a class as a function")}},function(t,n){function e(t,n){for(var e=0;e<n.length;e++){var o=n[e];o.enumerable=o.enumerable||!1,o.configurable=!0,"value"in o&&(o.writable=!0),Object.defineProperty(t,o.key,o)}}t.exports=function(t,n,o){return n&&e(t.prototype,n),o&&e(t,o),t}},function(t,n,e){e(3),e(4),t.exports=e(13)},function(n,e){n.exports=t},function(t,e){t.exports=n},,,,,,,,,function(t,n,e){"use strict";e.r(n);var o=e(0),r=e.n(o),a=e(1),i=e.n(a),u=function(){function t(){r()(this,t),this.appModel.jsonData||(this.appModel.jsonData={}),this.appModel.jsonData.actions||(this.appModel.jsonData.actions=[]),this.data=this.appModel.jsonData}return i()(t,[{key:"addAction",value:function(){this.data.actions.push({url:""})}},{key:"removeAction",value:function(t){this.data.actions[t]?(console.log("removing action "+this.data.actions[t].label+"("+t+")"),this.data.actions.splice(t,1)):console.warn("no action at index "+t)}}]),t}();u.templateUrl="components/config.html",e.d(n,"ConfigCtrl",(function(){return u}))}])}));
//# sourceMappingURL=module.js.map