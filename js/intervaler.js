(function ()
{
    'use strict';

    var root = this;
    
    var Intervaler = root.Intervaler = function(options)
    {
        if(_.isUndefined(options)){
            throw new Error("options argument is mandatory");
        }

        var intervaler = this;
        var config = options;
        var timer  = null;
        var cid    = _.uniqueId('inter');
        var steps  = 0;

        var createInterval = function()
        {
            disposeInterval();

            timer = setInterval ( onStep, config.milisecondsInterval);
        };

        var disposeInterval = function()
        {
            if(timer === null)
                return;
            
            clearInterval(timer);
            
            timer = null;
        };

        var callback = function(){
            config.callback.call((config.callbackContext || root), intervaler.getIdentityInfo());
        };

        var onStep  = function ()
        {
            if(timer === null)
                return;
            
            steps++;

            callback();

            if(config.oneStepOnly === true){
                disposeInterval();
            }
        };

        this.start = function()
        {
            if(timer !== null)
                return;

            steps = 0;
            
            if(config.useInitCall){
                setTimeout(function(){callback(); createInterval();}, config.initialMiliseconds);
                return;
            }

            createInterval();
        };

        this.cancel  = function()
        {
            disposeInterval();
        };

        this.reset = function(newOptions)
        {
            if(arguments.length > 0)
                config = newOptions;
            
            disposeInterval();
            
            this.start();
        };

        this.isStarted = function(){
            return timer !== null;
        };

        this.isCurrentInterval=function(intervalId){
            return intervalId === timer;
        };

        this.getIdentityInfo = function()
        {
            return [cid, timer || 'initial'].join("_");
        };

        this.getStepsCount = function()
        {
            return steps;
        };
    };

}).call(this);