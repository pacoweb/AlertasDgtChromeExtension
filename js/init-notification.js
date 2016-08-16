$(function() {
    
    'use strict';

    function main()
    {
        var backgroundPage = chrome.extension.getBackgroundPage();

        if(_.isUndefined(backgroundPage) || _.isNull(backgroundPage)){
            closeWindow();
            return;
        }

        var trafficApp = backgroundPage.trafficApp;
        
        if(_.isUndefined(trafficApp) || _.isNull(trafficApp)){
            closeWindow();
            return;
        }

        var newAlerts = trafficApp.getNewAlerts();

        if(newAlerts === null || newAlerts.length === 0){
            closeWindow();
            return;
        }

        moment.lang("es");

        _.mixin(_.str.exports());
        
        var notApp = new NotificationsApp(
                        {
                            mode : 0,
                            $container: $(window.document),
                            browserManager: 
                            {
                                chrome: chrome,
                                notifications: chrome.notifications,
                                navigator : navigator
                            }
                        }
        );
    
        notApp.init();
    }
        
    main();
});
