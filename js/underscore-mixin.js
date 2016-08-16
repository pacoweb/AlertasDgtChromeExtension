_.mixin({
on : function(obj, event, callback) {
// Define a global Observer
if(this.isString(obj)) {
callback = event;
event = obj;
obj = this;
}
if(this.isUndefined(obj._events)) obj._events = {};
if (!(event in obj._events)) obj._events[event] = [];
obj._events[event].push(callback);
return this;
},
once : function(obj, event, callback) {
if(this.isString(obj)) {
callback = event;
event = obj;
obj = this;
}
var removeEvent = function() { _.removeEvent(obj, event); };
callback = _.compose(removeEvent, callback);
this.on(obj, event, callback);
},
emit : function(obj, event, args){
if(this.isString(obj)) {
callback = event;
event = obj;
obj = this;
}
if(this.isUndefined(obj._events)) return;
if (event in obj._events) {
var events = obj._events[event].concat();
for (var i = 0, ii = events.length; i < ii; i++)
events[i].apply(obj, args === undefined ? [] : args);
}
return this;
},
removeEvent : function(obj, event) {
if(this.isString(obj)) { event = obj; obj = this; }
if(this.isUndefined(obj._events)) return;
console.log("remove");
delete obj._events[event];
}
});

_.mixin({
	deepClone:function(obj, deep)
	{
		if (!_.isObject(obj) || this.isFunction(obj)) return obj;
	    if (this.isDate(obj)) return new Date(obj.getTime());
	    if (this.isRegExp(obj)) return new RegExp(obj.source, obj.toString().replace(/.*\//, ""));
	    var isArr = (this.isArray(obj) || this.isArguments(obj));
	    if (deep) {
	      var func = function (memo, value, key) {
	        if (isArr)
	          memo.push(_.clone(value, true));
	        else
	          memo[key] = _.clone(value, true);
	        return memo;
	      };
	      return this.reduce(obj, func, isArr ? [] : {});
	    } else {
	      return isArr ? slice.call(obj) : this.extend({}, obj);
	    }
	}
});





