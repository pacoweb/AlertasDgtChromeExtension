(function ()
{
    'use strict';

    var root = this;

    var TrafficApp = root.TrafficApp = function(options)
    {
        if(_.isUndefined(options)){
            throw new Error("options argument is mandatory");
        }

        var app = this;
        var geolocation = options.browserManager.navigator.geolocation;
        var getMsg  = utils.getMsg;

        var defaultConfig = options.defaultConfig;
        var autoUpdater   = null;
        var isProcessing  = false;
        var lastSavedAlerts = null;
        var lastConfig = null;

        var geoWatchId = null;
        var lastUserPosition = null;
        var lastConfigBounds = null;
		    var notificationsApp = options.notificationsApp;

        var  closeAutomaticMode = function()
        {
            if(autoUpdater  === null)
                return;

            autoUpdater.cancel();
            autoUpdater = null;
        };

        var initAutomaticMode = function()
        {
            closeAutomaticMode();

            var milisecondsInterval = (getSavedConfig().minutesRefresh * 60) * 1000;

            autoUpdater = new Intervaler({milisecondsInterval : milisecondsInterval, callback: app.updateAlerts, callbackContext: app, useInitCall:true, initialMiliseconds: 200 });
            autoUpdater.start();
        };

        var setErrorBrowserAction = function()
        {
            var action = options.browserManager.chrome.browserAction;

            action.setBadgeBackgroundColor({color: "#000000" });
            action.setBadgeText({text: "X" });
            action.setTitle({title: getMsg("ico_error")});
        }

        var setSuccessBrowserAction = function()
        {
            var action = options.browserManager.chrome.browserAction;

            var alertsData = getSavedAlertsData();

            if(alertsData === null){
                action.setTitle({title: getMsg("no_alerts")});
                return;
            }

            var newAlerts = getSavedNewAlerts();
            var someNew = newAlerts !== null && newAlerts.length > 0;

            if(someNew)
            {
                var maxLevel    = _.max(_.uniq(_.map(newAlerts, function(a){return a.lv;})));
                var levelColor  = utils.getLevelColor(maxLevel);

                action.setBadgeBackgroundColor({color: levelColor });
                action.setBadgeText({text : newAlerts.length + "" });
            }

            var titleBuffer = [];

            if(someNew)
            {
                if(newAlerts.length === 1){
                    titleBuffer.push(_.sprintf(getMsg("ico_new_1_f"), utils.getLocationText(newAlerts[0])));
                }
                else{
                    titleBuffer.push(_.sprintf(getMsg("ico_news_f"), newAlerts.length));
                }

                 titleBuffer.push("\n");
            }
            else{
                action.setBadgeText({text: ""});
            }

            titleBuffer.push(_.sprintf(getMsg("pop_totals_f"), alertsData.items.length));

            action.setTitle({title: titleBuffer.join("")});
        };

        var isCurrentUpdater = function(autoUpdaterId)
        {
            if(autoUpdater === null)
                return false;

            return autoUpdater.getIdentityInfo() === autoUpdaterId;
        };

		var isDstDate = function(stringDate, useDefaultFormat)
		{
			var values = _.map(stringDate.split(useDefaultFormat ? "/" : "-"), function(num){return parseInt(num,0);});
            return moment([ useDefaultFormat ? values[2] : values[0] , values[1] -1, useDefaultFormat ? values[0] : values[3] ]).isDST();
		};

        var toMoment = function(stringDate, useDefaultFormat)
        {
            var isdst = isDstDate(stringDate, useDefaultFormat);
            return moment(stringDate +  (isdst ? ":00 +0200" : ":00 +0100"), useDefaultFormat === false ? "YYYY-MM-DD HH:mm:ss ZZ" : "DD/MM/YYYY HH:mm:ss ZZ");
        };

        var toSpanishTextFormat = function(stringDate){
            var space = " ";
            var parts = stringDate.split("-");
            var lastPart  = parts[parts.length -1].split(space);

            return lastPart[0] + "/" + parts[1] + "/" +parts[0] + space +  lastPart[lastPart.length -1];
        };

        var getDataFromXml = function(xmlDocument)
        {
            var $rootElm = $(xmlDocument).find('raiz');
            var versionText = $.trim($rootElm.attr("fecha_hora"));
            var xmlVersionMoment = toMoment(versionText, true);
            var lastXmlVersion   = getLastXmlMoment();

            if(lastXmlVersion !== null && xmlVersionMoment.diff(lastXmlVersion) <= 0)
                return null;

            var nowMoment = moment();
            var items = [];
            var justProvs = utils.getJustProvs();

            $rootElm.children("incidencia").each(
              function()
              {
                var $children = $(this).children();

                var tp,lv,prov = -1;
                var cau,pob,via,pki,pkf,sen,hac,ref,ver,fc_text = "";
                var x,y;
                var fc;
                var xyMode;

                pob = "";
                cau = "";
                hac = "";
                sen = "";

                x = 0.0;
                y = 0.0;
                xyMode = 0;

                $.each($children, function(ix, val)
                {
                    var $child   = $(val);
                    var nodeTag  = $child[0].nodeName.toLowerCase().trim();
                    var nodeText = $child.text().trim();
                    var upperText = nodeText.toUpperCase();

                    if(nodeText.length === 0)
                        return;

                    switch(nodeTag)
                    {
                        case "tipo":
                            tp = _.find(staticData.types, function(type)
                            {
                                if(upperText.indexOf("PUERTO") !== -1){
                                    return type.val.toUpperCase().indexOf("PUERTO") !== -1;
                                }

                                return type.val === upperText;
                            }).key;
                        break;
                        case "nivel":
                            lv = _.find(staticData.levels, function(level)
                            {
                                return level.val === upperText;
                            }).key;
                        break;
                        case "matricula":
                            prov = _.find(justProvs, function(prov)
                            {
                                return prov.ma === upperText;
                            }).key;
                        break;
                        case "causa":
                            cau = nodeText;
                        break;
                        case "poblacion":
                            pob = nodeText;
                        break;

                        case "fechahora_ini":
                            fc = toMoment(nodeText, false);
                            fc_text = toSpanishTextFormat(nodeText);
                        break;

                        case "carretera":
                            via = nodeText;
                        break;

                        case "pk_inicial":
                            pki = nodeText;
                        break;
                        case "pk_final":
                            pkf = nodeText;
                        break;

                        case "sentido":
                            sen = nodeText;
                        break;
                        case "hacia":
                            hac = nodeText;
                        break;

                        case "ref_incidencia":
                            ref = nodeText;
                        break;
                        case "version_incidencia":
                            ver = nodeText;
                        break;

                        case "x":
                            x = !_.isNaN(nodeText) ? parseFloat(nodeText) : 0.0;
                        break;
                        case "y":
                            y = !_.isNaN(nodeText) ? parseFloat(nodeText) : 0.0;
                        break;

                        case "tipolocalizacion":
                            xyMode = !_.isNaN(nodeText) ? parseInt(nodeText, 0) : 1;
                        break;
                    }

                });

                if(x === 0.0 || y === 0.0)
                {
                    var alertProv = _.find(justProvs, function(item){return item.key === prov;});

                    y = alertProv.lng;
                    x = alertProv.lat;
                    xyMode = 2;
                }

                if(meetFilters(tp,lv,prov,x,y, fc, nowMoment))
                {
                    items.push({tp:tp, lv:lv, prov:prov, cau:cau, pob:pob,
                        fc:fc.valueOf(), fc_text:fc_text, via:via, pki:pki, pkf:pkf, sen:sen, hac:hac,
                            ref:ref,ver:ver, x:x, y:y, xyMode:xyMode, isNew:false, isUpdate:false });
                }

            });

            if(items.length === 0)
                return null;

            return {dateVersion: xmlVersionMoment.valueOf(), dateVersion_fc: versionText, items: items};
        };

        var meetFilters = function(tp,lv,prov,x,y,fc,nowMoment)
        {
            var filters = getSavedConfig();

            //localizacion
            if(filters.locationMode === "prov")
            {
                if(_.indexOf(filters.locationProvs, prov) === -1)
                    return false;
            }
            else if(filters.locationMode === "zoom" || filters.locationMode === "ip")
            {
                if(x === 0.0 || y === 0.0)
                    return false;

                 var lonLat = new OpenLayers.LonLat(y,x);

                 if(filters.locationMode === "ip")
                 {
                    if(lastUserPosition === null)
                        return false;

                    //var distance = OpenLayers.Util.distVincenty(lonLat, lastUserPosition.lonLat);
					var pos = lastUserPosition.position.coords;
					var distance = utils.calculateDistance(pos.latitude, pos.longitude, x, y);

                    if(distance > filters.locationIpDistance)
                        return false;
                 }
                 else
                 {
                    if(lastConfigBounds === null)
                        return false;

                    if(!lastConfigBounds.containsLonLat(lonLat))
                        return false;
                 }
            }

            if(_.indexOf(filters.levels, lv) === -1)
                return false;

            if(_.indexOf(filters.types, tp) === -1)
                return false;

            //discart days
            if(filters.discartDays > 0)
            {
                if(nowMoment.diff(fc, 'days') > filters.discartDays)
                {
                    return false;
                }
            }

            return true;
        };

        var saveAlerts = function(newItems)
        {
            lastSavedAlerts    = null;
            root.localStorage.savedAlerts2 = JSON.stringify(newItems);
            lastSavedAlerts    = newItems;
        };

        var clearSavedAlerts = function()
        {
            lastSavedAlerts    = null;
            root.localStorage.removeItem("savedAlerts2");
        };

        var getLastXmlMoment = function()
        {
            if(lastSavedAlerts === null)
                return null;

            return moment(lastSavedAlerts.dateVersion);
        };

        var showNotification = function()
        {
			notificationsApp.showNotificacions();
        };

        var sendMessage = function()
        {
            options.browserManager.chrome.extension.sendMessage({eventName:"newAlerts"});
        };

        var handleNewAlerts = function()
        {
            showNotification();
            sendMessage();
        };

        var handleSavedAlerts = function()
        {
            setSuccessBrowserAction();
        };

        var getSavedConfig = function()
        {
            if(lastConfig !== null)
                return lastConfig;

            if(_.isUndefined(root.localStorage.userConfig2))
                lastConfig = defaultConfig;
            else
                lastConfig = JSON.parse(root.localStorage.userConfig2);

            return lastConfig;
        };

        var getSavedAlertsData = function()
        {
            if(lastSavedAlerts !== null)
                return lastSavedAlerts;

            if(_.isUndefined(root.localStorage.savedAlerts2) || root.localStorage.savedAlerts2 === null)
                lastSavedAlerts = null;
            else
                lastSavedAlerts = JSON.parse(root.localStorage.savedAlerts2);

            return lastSavedAlerts;
        };

        var initGeo = function(mode)
        {
            if(mode === "prov")
                return;

            if(mode=== "ip")
            {
                geoWatchId = geolocation.watchPosition(
                    function(position)
                    {
                        lastUserPosition = {
                            position: position,
                            lonLat: new OpenLayers.LonLat(position.coords.longitude, position.coords.latitude)
                        };
                    },
                    function (geoError){
                        console.log(geoError);
                    });
            }
            else if(mode === "zoom")
            {
                lastConfigBounds = new OpenLayers.Bounds(getSavedConfig().locationZoomBounds).transform("EPSG:3857", "EPSG:4326");
            }
        };

        var clearGeo = function()
        {
            lastConfigBounds = null;

            if(geoWatchId === null)
                return;

            geolocation.clearWatch(geoWatchId);
            geoWatchId = null;
        };

        var deleteOldVersionsData = function()
        {
            localStorage.removeItem("savedAlerts");
            localStorage.removeItem("userConfig");
        };

        var getSavedNewAlerts = function()
        {
            var data = getSavedAlertsData();

            if(data === null)
                return null;

            return _.filter(data.items, function(a){
                return a.isNew === true;
            });
        }

        this.saveNewConfig = function(newConfig)
        {
            closeAutomaticMode();

            clearGeo();

            clearSavedAlerts();

            lastConfig    = null;
            root.localStorage.userConfig2 = JSON.stringify(newConfig);
            lastConfig    = newConfig;

            initGeo(newConfig.locationMode);

            if(this.isAutomaticMode()){
                initAutomaticMode();
            }
        };

        this.getConfig = function()
        {
            return getSavedConfig();
        };

        this.getAlertsData = function()
        {
            return getSavedAlertsData();
        };

        this.getNewAlerts = function()
        {
            return getSavedNewAlerts();
        };

        this.processResults = function(xml)
        {
            var autoUpdaterId  = null;
            var forceProcess   = false;

            if(arguments.length > 1)
            {
                if(_.isString(arguments[1]))
                    autoUpdaterId = arguments[1];
                else if(_.isBoolean(arguments[1]))
                    forceProcess = arguments[1];
                else
                    throw new Error("Invalid arguments on processResults");

                if(autoUpdaterId !== null && autoUpdaterId.indexOf('initial') > -1)
                    autoUpdaterId = null;
            }

            if( (autoUpdaterId !== null && !isCurrentUpdater(autoUpdaterId)) ||
                (isProcessing && !forceProcess)
              )
            {
                return;
            }

            isProcessing = true;

            var data = getDataFromXml(xml);

            if(data === null || data.items === null || data.items.length === 0)
            {
                isProcessing = false;
                return;
            }

            var storedAlerts = this.getAlertsData();
            var storedItems  = storedAlerts ? storedAlerts.items : [];

            var newAlerts = _.filter(data.items, function (item){
                return !_.any(storedItems, function(savedItem){
                    return item.ref === savedItem.ref;
                });
            });

            var updatedAlerts = _.filter(data.items, function (item){
                return _.any(storedItems, function(savedItem){
                    return item.ref === savedItem.ref && item.ver !== savedItem.ver;
                });
            });

            _.each(newAlerts, function(item){
                item.isNew = true;
            });

            _.each(updatedAlerts, function(item){
                item.isUpdate = true;
            });

            if(autoUpdaterId === null || isCurrentUpdater(autoUpdaterId))
            {
                saveAlerts(data);

                _(this).emit('savedAlerts');

                if(_.any(newAlerts))
                    _(this).emit('newAlerts');
            }

            isProcessing   = false;
        };

        this.getMessage = function(msg){
            return getMsg(msg);
        };

        this.updateAlerts = function(autoUpdaterId)
        {
            var that = app;

            $.ajax({url:options.urlService, cache:false})
                .done(function(xml)
                {
                    app.processResults(xml, autoUpdaterId);
                })
                .fail(function()
                {
                    root.console.log(that.getMessage("error_get_url"));
                });
        };

        this.init = function()
        {
            deleteOldVersionsData();

            _(this).on('savedAlerts', handleSavedAlerts);
            _(this).on('newAlerts', handleNewAlerts);

             initGeo(this.getConfig().locationMode);

            if(this.isAutomaticMode()){
                initAutomaticMode();
            }
        };

        this.dispose = function()
        {
            _(this).removeEvent('newAlerts');
            _(this).removeEvent('savedAlerts');

            autoUpdater   = null;
            isProcessing  = false;
            lastSavedAlerts = null;
            lastConfig = null;
        };

        this.isAutomaticMode = function()
        {
            return options.mode === 0; //AUTO
        };
    };

}).call(this);
