(function (){
    'use strict';

    var root = this;
    var $container = $(window.document);

    var initOptions = {urlService:"https://www.dgt.es/incidenciasXY.xml", mode: 0, 
            browserManager: 
            {
                chrome: chrome,
                notifications: chrome.notifications,
                navigator : navigator
            },
            defaultConfig:
            {    
                isDefault:true, 

                locationMode:"zoom",
                locationZoomBounds:staticData.spainFullExtentConfig, 
                locationProvs:[4],
                locationIpDistance:30,

                types:[1,2,3,4,5], 
                levels:[2,3,4], 

                discartDays:3,

                minutesRefresh:1, 
                
                useNotifications:true, 
                notificationsSecondsDisplay:40, 
                useNotificationsWithSound:true,
                notificationsSoundFile:"speech", 
                notificationsSoundVolume:0.3
            },
			
        };

		initOptions.notificationsApp = new NotificationsApp({
                                $container: $container,
								browserManager: initOptions.browserManager
							});
						
    function main()
    {
       moment.lang('es');

       _.mixin(_.str.exports());

       root.trafficApp = new TrafficApp(initOptions);
       root.trafficApp.init();
	   
    }
    
    main();
    
}).call(this);
