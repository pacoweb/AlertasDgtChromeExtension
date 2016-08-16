(function ()
{
    'use strict';

    var root = this;

    var NotificationsApp = root.NotificationsApp = function(options)
    {
        if(_.isUndefined(options)){
            throw new Error("options argument is mandatory");
        }

		var trafficApp = null;
        var alertsData = null;
        var alerts = [];
        var newAlerts = [];
		    var config = null;

        var $parent = options.$container;
        var getMsg  = options.browserManager.chrome.i18n.getMessage;
        var idList  = "alerts";
        var provs   = utils.getJustProvs();

        var uniqProvs = [];
        var currentApiNotificationID = 0;

    		var updateAlertsInfo = function()
    		{
    			if(trafficApp == null)
    				trafficApp = options.browserManager.chrome.extension.getBackgroundPage().trafficApp;

    			config  = trafficApp.getConfig();

    			alertsData = trafficApp.getAlertsData();
    			alerts = _.isNull(alertsData) ? [] : alertsData.items;
    			newAlerts = _.filter(alerts, function(a){return a.isNew === true;});
    		};

        var prepareUniqueProvs = function()
        {
            uniqProvs = [];

            _.each(newAlerts, function(a){

                var uniqProv = _.find(uniqProvs, function(item){return item.key === a.prov});

                if(_.isUndefined(uniqProv))
                    uniqProvs.push(_.find(provs, function(item){return item.key === a.prov}));
            });
        };

        var getSpeechSummary = function()
        {
            var uniqProvsTexts = _.map(uniqProvs, function(item){return getMsg(item.msg);});
                var locations = _.toSentence(_.sortBy(uniqProvsTexts, function(t){
                        return t.toUpperCase().replace(/Á/g, "A").replace(/É/g, "E").replace(/Í/g, "I").replace(/Ó/g, "O").replace(/^Ú/g, "U");
                })
                , ', '
                , getMsg("txt_and_step"));

            if(newAlerts.length === 1)
            {
                if(newAlerts[0].pob.length > 0 && newAlerts[0].pob.toLowerCase() != locations.toLowerCase()){
                    locations = newAlerts[0].pob + ", " + locations;
                }

                return _.sprintf(getMsg("txt_speech_onealert_f"), locations);
            }

            return _.sprintf(getMsg("txt_speech_alerts_f"), locations);
        };

      var $g = function(selector)
      {
          return $parent.find(selector);
      };

      var getCurrentID = function()
      {
          return ["_alertsNews", currentApiNotificationID].join("");
      };

      var notificationClearCallBack = function()
      {
          currentApiNotificationID = 0;
      };

  		var notificationCreateCallBack = function()
  		{
          console.log("notificationCreateCallBack");
          console.log(arguments);
  		};

      var notificationClosedCallBack = function()
      {
          console.log("notificationClosedCallBack");
      };

      var playSound = function()
      {
          if(config.useNotifications === false || config.useNotificationsWithSound === false)
              return;

          if(config.notificationsSoundFile === "speech")
          {
              options.browserManager.chrome.tts.getVoices(function(voices)
              {
                 var voiceName = "native";
                 var betterVoice = _.find(voices, function(v){return v.voiceName === "iSpeech"});

                  if(!_.isUndefined(betterVoice))
                      voiceName = betterVoice.voiceName;

                  options.browserManager.chrome.tts.speak(
                          getSpeechSummary(),
                          {
                              voiceName: voiceName,
                              enqueue:false,
                              pitch:1.0,
                              rate: 0.5,
                              volume: config.notificationsSoundVolume
                          },
                          function(){
                              if(options.browserManager.chrome.extension.lastError)
                                  console.log(options.browserManager.chrome.extension.lastError);
                          }
                  );
              });

              return;
          }

        var $audio = $g("#audioNotif");
        var audioElm = $audio[0];

        var fullFilePath = "audio/" + config.notificationsSoundFile;

        if(fullFilePath != $audio.attr("src"))
            $audio.attr("src" , fullFilePath);

        audioElm.volume = config.notificationsSoundVolume;
        audioElm.play();
    };

   var getCaption = function()
   {
        var alertsCount = alerts.length;
        var newCount = newAlerts.length;

        var caption = [];

        if(newCount === 1)
            caption.push(getMsg("txt_oneAlert"));
        else
            caption.push(_.sprintf(getMsg("txt_newAlerts_f"), newCount));

        if(alertsCount > 1)
        {
            caption.push(" (");
            caption.push(_.sprintf(getMsg("txt_totalAlerts_f"), alertsCount));
            caption.push(")");
        }

        return caption.join("");
    };

    var getAlertsList = function()
    {
        var buffer = [];

        var sortedAlerts = _.sortBy(newAlerts, function(item){return item.fc;}).reverse();

        _.each(sortedAlerts, function(a)
        {
            var alertSummary = a.via + " " + utils.getLocationText(a) + "\n" + utils.fromNowText(a);

            buffer.push({title: utils.getTitleText(a), message: alertSummary});
        });

        return buffer;
    };

    var openNotifications = function()
    {
      var caption = getCaption();

      var notificationOps = {
        type : "list",
        title: caption,
        message: caption,
        items: getAlertsList(),
        iconUrl: "icons/icon16.png"
      };

      currentApiNotificationID++;

      chrome.notifications.create(getCurrentID()
        , notificationOps
        , notificationCreateCallBack);
    };

	this.showNotificacions = function()
	{
		if(currentApiNotificationID !== 0){
			options.browserManager.notifications.clear(getCurrentID(), notificationClearCallBack);
		}

		updateAlertsInfo();

		prepareUniqueProvs();

		playSound();

		openNotifications();
	};

  };

}).call(this);
