$(function() {
    
    'use strict';

    function main()
    {
        moment.lang("es");

        _.mixin(_.str.exports());
        
        var popupApp = new PopupApp(
                        {
                            userOptions:{
                                types : [1,2,3,4,5], levels : [1,2,3,4], oldnews : [0,1], sorting : "news", useMarkersExtent:true
                            },
                            mode : 0, //Automatic
                            alertsDataSource : 0, //Origen de las alertas, 
                            $container: $(window.document),
                            browserManager: 
                            {
                                chrome: chrome,
                                notifications: chrome.notifications,
                                navigator : navigator
                            }
                        }
        );

        $(window).unload(function(){
            popupApp.unBindEvents();
            popupApp = null;
        });

        popupApp.setUserPosition(popupApp.init); 

    }
        
    main();
});
