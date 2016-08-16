$(function() {
    
    'use strict';

    var loadID = "load";
    var maskID = "mask";

    function showModalWindow()
    {
        var $window = $(window);
        var $doc    = $(document);
        var $mask   = $('#' + maskID);
        var $load   = $('#' + loadID);

        var maskHeight = $doc.height();
        var maskWidth = $window.width();

        $mask.css({'width':maskWidth,'height':maskHeight}).fadeIn().fadeTo("slow", 0.8);  

        var winH = $window.height();
              
        $load.css({'top': (winH/2)-$load.height(), 'left' : (maskWidth/2)-$load.width()/2}).fadeIn();
    }

    function hideModalWindow()
    {
        $('#' + maskID).hide();
        $('#' + loadID).hide();
    }
    

    function main()
    {
        _.mixin(_.str.exports());

        $("#" +  loadID).html(utils.getMsg("op_load"));

        showModalWindow();

        var optApp = new OptionsApp(
                        {
                            closeOnSave: false,
                            $container: $(window.document),
                            browserManager: 
                            {
                                chrome: chrome,
                                notifications: chrome.notifications,
                                navigator : navigator
                            },
                            mode: 0,
                            readyCallBack: hideModalWindow
                        }
        );
    
        optApp.init();
    }
        
    main();
   


});
