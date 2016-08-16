(function ()
{
    'use strict';

    var root = this;

    var PopupApp = root.PopupApp = function(options)
    {
        if(_.isUndefined(options)){
            throw new Error("options argument is mandatory");
        }

        var LevelsClientId  = "levels";
        var TypesClientId   = "types";
        var SortingClientId = "sorting";
        var OldNewsClientId = "oldnews";
        var AlertsListClientId = "alertsList";
        var MapClientId = "map";
        var RefreshId = "refresh";
        var ChangeSourceId = "changeSource";
        var GoInitialViewId = "goInitialView";
        var GoFullViewId = "goFullView";
        var ChangeMapTypeClientId = "changeMapType";

        var TrafficAppDatabaseName = "TrafficApp";
        var HistoricalObjectStoreName = "Historical";

        var RoadMapType   = "roadmap";
        var HybridMapType = "hybrid";

        var app = this;

        var trafficApp = options.browserManager.chrome.extension.getBackgroundPage().trafficApp;
        var config  = trafficApp.getConfig();
        var $parent = options.$container;
        var getMsg  = options.browserManager.chrome.i18n.getMessage;
        var userOptions = options.userOptions;
        var initialUserOptions = _.deepClone(userOptions, true);
        var provs   = utils.getJustProvs();
        var geolocation = options.browserManager.navigator.geolocation;

        var mapControl  = null;
        var currentSource = null;
        var currentSourceData = null;
        var filteredItems = null;
        var mapMarkers = null;
        var mapIcons   = null;
        var lastUserPosition = null;
        var initialMapExtent = null;

        var syncMapWithList = true;
        var uniqProvs = [];

        var historicalStoreDef = (function () {ixDbEz.createObjStore(HistoricalObjectStoreName, "ref", false);});
        var historicalStoreCreated = false;

        var isChangeEventCancelled = false;
        var isAddToHistoricEventCancelled = false;
        var isRemoveFromHistoricEventCancelled = false;

        var currentMapType = RoadMapType;

        var tryCreateDataBases = function()
        {
            var ixDbConnection = ixDbEz.startDB(TrafficAppDatabaseName, 1, historicalStoreDef, 
                function()
                {
                    historicalStoreCreated = true;
                }, 
                function()
                {
                    historicalStoreCreated = false;

                    ensureCreateHistoricStorageAux();
                }, 
                false);
        };

        var removeFromHistoricStorageAux = function(alertItem)
        {
            ensureCreateHistoricStorageAux();

            var idRef  = alertItem.ref;
            var alerts = JSON.parse(root.localStorage[HistoricalObjectStoreName]);

            updateHistoricStorageAux(_.filter(alerts, function(a){return a.ref !== idRef;}));
        };

        var addOrUpateToHistoricStorageAux = function(alertItem)
        {
            ensureCreateHistoricStorageAux();

            var idRef  = alertItem.ref;
            var alerts = JSON.parse(root.localStorage[HistoricalObjectStoreName]);

            var tmp = _.filter(alerts, function(a){return a.ref !== idRef;});

            tmp.push(alertItem);

            updateHistoricStorageAux(tmp);
        };

        var updateHistoricStorageAux = function(items)
        {
            if(_.isUndefined(items) || _.isNull(items)){
                items = [];
            }

            root.localStorage[HistoricalObjectStoreName] = JSON.stringify(items);
        };

        var ensureCreateHistoricStorageAux = function()
        {
            var storage = root.localStorage[HistoricalObjectStoreName];

            if(_.isUndefined(storage) || _.isNull(storage)){
                updateHistoricStorageAux([]);
            }
        };

        var addToHistoricStore = function(alertItem, callback)
        {
            var idRef = alertItem.ref;

            alertItem.isNew = false;
            alertItem.saved = moment().valueOf();

            if(!historicalStoreCreated)
            {
                var isError = false;

                try
                {
                    addOrUpateToHistoricStorageAux(alertItem);
                }
                catch(excep)
                {
                    console.log(excep);
                    isError = true;
                }

                callback({idRef:idRef, error:isError});

                return;
            }

            ixDbEz.put(HistoricalObjectStoreName, alertItem,
                undefined,
                function(){
                    callback({idRef:idRef, error:false});
                }, 
                function(){
                    callback({idRef:idRef, error:true});
                },
                undefined
            );
        };

        var removeFromHistoricStore = function(alertItem, callback)
        {
            var idRef = alertItem.ref;

             if(!historicalStoreCreated)
            {
                var isError = false;

                try
                {
                    removeFromHistoricStorageAux(alertItem);
                }
                catch(excep)
                {
                    console.log(excep);
                    isError = true;
                }

                callback({idRef:idRef, error:isError});

                return;
            }

            ixDbEz.delete(HistoricalObjectStoreName, alertItem.ref, 
                function(){
                    callback({idRef:idRef, error:false});
                }, 
                function(){
                    callback({idRef:idRef, error:true});
                },
                undefined
            );
        };

        var refreshHistoricalData = function(callback)
        {
            if(!historicalStoreCreated)
            {
                ensureCreateHistoricStorageAux();
                callback({error:false, items:JSON.parse(root.localStorage[HistoricalObjectStoreName])});
                return;
            }

            var items = [];

            ixDbEz.getCursor(HistoricalObjectStoreName, 
                function(req)
                {
                    if(_.isUndefined(req))
                        return;

                    req.onsuccess = function(){
                        var cursor = req.result;

                        if(_.isUndefined(cursor) || _.isNull(cursor))
                        {
                            if(!_.isUndefined(callback))
                            {
                                callback({error:false, items:items});
                            }
                            return;
                        }

                        items.push(cursor.value);

                        cursor.continue();
                    };
                },
                function(ee)
                {
                     if(!_.isUndefined(callback)){
                        callback({error:true});
                     }
                },
                undefined,
                false,
                undefined
             );
        };

        var prepareUniqueProvs = function()
        {
            _.each(currentSourceData.items, function(a){

                var uniqProv = _.find(uniqProvs, function(item){return item.key === a.prov});

                if(_.isUndefined(uniqProv))
                    uniqProvs.push(_.find(provs, function(item){return item.key === a.prov}));
            });
        };

        var $g = function(selector)
        {
            return $parent.find(selector);
        };

        var buildList = function(cntid, list, preText, type)
        {
            var $cnt = $g("#" + cntid).first();
            
            var propText = "msg";
            var propVal  = "key";

            if(_.isNull(type) || _.isUndefined(type)){
                type = "checkbox";
            }

            var htmlBuffer = [];

            if(!_.isNull(preText)){
                htmlBuffer.push('<span class="filterText">' + preText + '</span>');
            }

            _.each(list, function(item)
            {
               var val  = item[propVal];
               var text = getMsg(item[propText]);
               var idCtrl = cntid + "_" + val;

               var dataAttribute = 'data-bind-val="' + cntid + '"';

               htmlBuffer.push('<input class="css_' + idCtrl + '" type="' + type + '" id="' + idCtrl + '"  ' + dataAttribute  + ' name="' + cntid + '_group" value="' + val + '" /><label class="css_' + idCtrl + '" for="' + idCtrl + '">' + text + '</label>');

               if(cntid === "sorting" && (val === "olds" || val === "levels")){
                   htmlBuffer.push('<div class="jump"></div>'); 
               }

            });

            $cnt.html(htmlBuffer.join(""));
        };

        var getLevelCssClass = function(a){
            var level = _.find(staticData.levels, function(lv){
                return lv.key === a.lv;
            });

            return level.val.toLowerCase();
        }

        var getListItemTemplate = function()
        {
            var htmlBuffer = [];

            htmlBuffer.push('<li title="%s">');
                htmlBuffer.push('<div class="item %s" data-id="%s">');
                    htmlBuffer.push('<div class="one">');
                        htmlBuffer.push('<em>%s</em> %s <em class="loc" title="%s">%s</em>');
                    htmlBuffer.push('</div>');
                    htmlBuffer.push('<div class="two">');
                        htmlBuffer.push('%s %s');
                    htmlBuffer.push('</div>');
                    htmlBuffer.push('<div class="three">');
                        htmlBuffer.push('%s <em>%s</em>');
                    htmlBuffer.push('</div>');
                    htmlBuffer.push('<div class="four">');
                        htmlBuffer.push('<div class="four1">');
                            htmlBuffer.push('%s');
                        htmlBuffer.push('</div>');
                        htmlBuffer.push('<div class="four2">');
                            htmlBuffer.push('');
                        htmlBuffer.push('</div>');
                    htmlBuffer.push('</div>');
                htmlBuffer.push('</div>');
                htmlBuffer.push('<div class="tip" title="%s">%s</div>');
                htmlBuffer.push('<div class="save" title="%s">%s</div>');
                htmlBuffer.push('<div class="remove" title="%s">%s</div>');
            htmlBuffer.push('</li>');

            return htmlBuffer.join("");
        };

        var clearAlertsList = function($cnt)
        {
            if(_.isUndefined($cnt))
                $cnt = $g("#" + AlertsListClientId);

            $cnt.empty();
        };

        var buildAlertsList = function($cnt)
        {
            clearAlertsList($cnt);

            var htmlBuffer = [];

            var items   = filteredItems;
            var markers = mapMarkers === null ? [] : mapMarkers.markers;

            items = _.filter(items, 
                function(item)
                {
                    var marker = _.find(markers, function(m){return m.ref === item.ref;});
                    var result = true;

                    if(!_.isUndefined(marker)){
                        result = marker.onScreen();
                    }

                    return result;
                }
            );
            
            var itemTemplate = getListItemTemplate();

            _.each(items, function(a)
            {
                var haciaText = a.hac;
                var causaText = a.cau;

                if(causaText.length > 0){
                    causaText = _.titleize(causaText.toLowerCase());
                }

                if(haciaText.length > 0){
                    haciaText = _.sprintf(utils.getMsg("txt_hacia_f2"), _.titleize(haciaText.toLowerCase()));
                }

                var location  = utils.getLocationText(a);

                var htmlIsNew  = "&nbsp;";
                var titleIsNew = "";

                if(a.isNew === true)
                {
                    htmlIsNew  = utils.getMsg("pop_letter_new");
                    titleIsNew = utils.getMsg("pop_title_new");
                }

                var htmlSave  = utils.getMsg("pop_letter_save");
                var titleSave = utils.getMsg("pop_title_save");

                var htmlRemove  = utils.getMsg("pop_letter_remove");
                var titleRemove = utils.getMsg("pop_title_remove");

                if(currentSource === 0){
                    htmlRemove  = "";
                    titleRemove = "";
                }
                else if(currentSource === 1)
                {
                    htmlSave  = "";
                    titleSave = "";
                }

                htmlBuffer.push(_.sprintf(itemTemplate
                    , utils.getMsg("pop_click_tolocal")
                    , utils.getLevelCssClass(a)
                    , a.ref
                    , a.via
                    , utils.getKmsLiteral(a)
                    , location
                    , location
                    , _.titleize(a.sen.toLowerCase())
                    , haciaText
                    , a.fc_text
                    , causaText
                    , utils.getMsgLevelLongText(a)
                    , titleIsNew
                    , htmlIsNew
                    , titleSave
                    , htmlSave
                    , titleRemove
                    , htmlRemove
                    ));
            });
    
            $cnt.html(htmlBuffer.join(""));
        };

        var applyFilterOnList = function(group, isIntValue){
            $g("input[name='" + group + "_group']").each(function(){
                    var $t  = $g(this);
                    var val =  isIntValue ? parseInt($t.val(),0) : $t.val();

                    if(_.indexOf(userOptions[group], val) !== -1){
                        $t.attr("checked", "checked");
                    }
              });
        };

        var updateOptionsFromList = function(group, isIntValue){
            $g("input[name='" + group + "_group']:checked").each(function(){
                userOptions[group].push(isIntValue ? parseInt($g(this).val(),0) : $g(this).val());
            });
        };

        var applyUserFilters = function()
        {
            if(!anyNewAlert()){
                userOptions.oldnews = [1,0];
            }

            applyFilterOnList(OldNewsClientId, true);
            applyFilterOnList(TypesClientId, true);
            applyFilterOnList(LevelsClientId, true);

            $g("input[name='" + SortingClientId + "_group']").each(function(){
               var $t  = $g(this);
               var val = $t.val();

               if(val === userOptions.sorting){
                    $t.attr("checked", "checked");
               }
            });
        };

        var updateUserOptions = function()
        {
            userOptions.types.length   = 0;
            userOptions.levels.length  = 0;
            userOptions.oldnews.length = 0;
            userOptions.sorting = null;

            updateOptionsFromList(OldNewsClientId, true);
            updateOptionsFromList(TypesClientId, true);
            updateOptionsFromList(LevelsClientId, true);

            $g("input[name='" + SortingClientId + "_group']:checked").each(function(){
               userOptions.sorting = $g(this).val();
            });
        };

        var filterItems = function()
        {
            var includeNewAlerts = _.indexOf(userOptions.oldnews, 1) !== -1;
            var includeOldAlerts = _.indexOf(userOptions.oldnews, 0)!== -1;

            var tempList = _.filter(currentSourceData.items, function(item)
            {
                if(currentSource === 0 &&  (item.isNew && !includeNewAlerts)
                        || (!item.isNew && !includeOldAlerts))
                    return false;

                if(_.indexOf(userOptions.types, item.tp)=== -1)
                    return false;

                if(_.indexOf(userOptions.levels, item.lv)=== -1)
                    return false;

                return true;
            });

            filteredItems = tempList;
        };

        var sortItems = function()
        {
            if(userOptions.sorting === "news")
                filteredItems = _.sortBy(filteredItems, function(item){return item.fc;}).reverse();
            else if(userOptions.sorting === "olds")
                filteredItems = _.sortBy(filteredItems, function(item){return item.fc;});
            else if(userOptions.sorting === "levels")
                filteredItems = _.sortBy(filteredItems, function(item){return item.lv;}).reverse();
            else if(userOptions.sorting === "types")
                filteredItems = _.sortBy(filteredItems, function(item){return item.tp;});
            else if(userOptions.sorting === "proximity" && lastUserPosition != null)
            {
                filteredItems = _.sortBy(filteredItems, 
                    function(item)
                    {
                        var pos = lastUserPosition.position.coords;
						var distance = utils.calculateDistance(item.x, item.y, pos.latitude, pos.longitude);
						return distance;
                    }
                );
            }
            else 
                filteredItems = filteredItems;
        }

        var changeDisplayOnMapMarkers = function()
        {
            if(mapMarkers === null || mapMarkers.markers === null
                    || mapMarkers.markers.length === 0)
                return;

            var markers = mapMarkers.markers;

            _.each(markers, function (marker)
            {
                var ref  = marker.ref;

                if(ref === -1)
                    return;

                var show = false;

                if(!_.isUndefined(_.find(filteredItems, function(item){return ref === item.ref;}))){
                    show = true;
                }

                marker.display(show);
            });
        };

        var endActionFromHistoric = function(isInsert, isError)
        {
            var $res = $g("#histoResult");

            var msg  = ["pop", "_", (isInsert ? "save" : "remove"), "_", (isError ? "bad" : "good")].join("");

            $res.text(utils.getMsg(msg));

            $res.fadeIn('slow').fadeOut('slow', function(){
                if(isInsert)
                    isAddToHistoricEventCancelled = false;
                else
                    isRemoveFromHistoricEventCancelled = false;
            });
        };

        var handleChangeSource = function()
        {
            var newDataSource = currentSource === 0 ? 1 : 0;

            $g("#" + ChangeSourceId).text(getMsg("pop_hco_" + currentSource));
            
            app.setAlertsDataSource(newDataSource, true);
        };

        var handleOpenConfig = function()
        {
            var chrome = options.browserManager.chrome;

            chrome.tabs.create({
                url: "options.html"
            });
        };

        var handleNewAlerts = function()
        {
            if(currentSource === 0){
                $g("#" + RefreshId).show().fadeOut().fadeIn();
            }
        };

        var handleUserChange = function(isZoomChange)
        {
            if(isChangeEventCancelled === true)
                return;

            if(!isZoomChange){
                updateUserOptions();
                filterItems();
                sortItems();
                changeDisplayOnMapMarkers();
            }

            buildAlertsList($g("#" + AlertsListClientId), isZoomChange);
        };

        var handleDoOver = function(idRef)
        {
            var marker = _.find(mapMarkers.markers, function(m){return m.ref === idRef});

            $g(marker.icon.imageDiv).fadeOut().fadeIn();
        }

        var handleDoZoom = function(idRef)
        {
            var marker = _.find(mapMarkers.markers, function(m){return m.ref === idRef});

            $g("div[id^='OL_Icon']").css("border", "");

            $g(marker.icon.imageDiv).css("border", "1px solid gray");
            
            mapControl.setCenter(marker.lonlat, 10, true, true);

            _(app).emit('userChanged', [true]);
        };

        var handleGoInitialView = function()
        {
            mapControl.zoomToExtent(initialMapExtent, false);
        };

        var handleGoFullView = function()
        {
            mapControl.zoomToExtent(staticData.spainFullExtentPopup, true);
        };

        var handleSaveToHistorical = function(idRef)
        {
            if(isAddToHistoricEventCancelled === true)
                return;

            var alertItem = _.find(filteredItems, function(item){return item.ref === idRef});

            if(_.isUndefined(alertItem))
                return;

            var that = app;

            isAddToHistoricEventCancelled = true;

            addToHistoricStore(alertItem, function(result)
            {
                endActionFromHistoric(true, result.error === true);
            });
        };

        var handlechangeMapType = function()
        {
            currentMapType = currentMapType === RoadMapType ? HybridMapType : RoadMapType;

            var btnTxt = utils.getMsg(currentMapType === RoadMapType ? "pop_maptype_satellite" : "pop_maptype_road");
            var titleTxt = utils.getMsg(currentMapType === RoadMapType ? "pop_maptype_satellite_title" : "pop_maptype_road_title");

            var $changeMap = $g("#" + ChangeMapTypeClientId);
            $changeMap.attr("title", titleTxt);
            $changeMap.text(btnTxt);

            mapControl.baseLayer.redraw();
        };

        var handleRemoveFromHistorical = function(idRef)
        {
            if(isRemoveFromHistoricEventCancelled === true)
                return;

            var alertItem = _.find(filteredItems, function(item){return item.ref === idRef});

            if(_.isUndefined(alertItem))
                return;

            var that = app;

            isRemoveFromHistoricEventCancelled = true;

            removeFromHistoricStore(alertItem, function(result)
            {
                var anyError = result.error === true;

                if(!anyError)
                {
                    currentSourceData.items = _.filter(currentSourceData.items, function(item){
                        return item.ref !== result.idRef;
                    });

                    setSummaryTitle();

                    if(currentSourceData.items === null 
                            || currentSourceData.items.length === 0){
                        clearMarkersOnMap();
                    }
                }

                endActionFromHistoric(false, anyError);

                if(!anyError)
                    _(that).emit('userChanged', [false]);
            });
        };


        var getBaseLayer = function()
        {
            return new OpenLayers.Layer.Grid(
                            "Google Static",
                            "http://maps.googleapis.com/maps/api/staticmap?sensor=false",
                            null, 
                            {
                                singleTile: true,
                                ratio: 1,
                                isBaseLayer: true,
                                wrapDateLine: true,
                                getURL: function() {
                                    var center = this.map.getCenter().transform("EPSG:3857", "EPSG:4326");
                                    var size   = this.map.getSize();

                                    return [
                                        this.url, "&key=", staticData.mapKey, "&maptype=", currentMapType, "&center=", center.lat, ",", center.lon,
                                        "&zoom=", this.map.getZoom(), "&size=", size.w, "x", size.h
                                        ].join("");
                                }
                            }
                );
        };

        var getNewMapControl = function(baselayer, options)
        {
            var mapOptions = {
                    div: MapClientId,
                    projection: "EPSG:3857",
                    layers: [baselayer],
                    numZoomLevels:22,
            };

            if(!_.isUndefined(options.center) && !_.isNull(options.center)){
                mapOptions.center = options.center;
            }

            if(!_.isUndefined(options.zoom) && !_.isNull(options.zoom)){
                mapOptions.zoom = options.zoom;
            }

            if(!_.isUndefined(options.extent) && !_.isNull(options.extent)){
                mapOptions.extent = options.extent;
            }

            return new OpenLayers.Map(mapOptions);
        };

        var buildMapControl = function()
        {
            var baseLayer = getBaseLayer();
            var options;

            if(config.locationMode === "zoom") {
                var bounds = new OpenLayers.Bounds(config.locationZoomBounds);
                options = {center:bounds.getCenterLonLat()};
            }
            else if(config.locationMode === "ip" && lastUserPosition !== null)
			{
                var pos = lastUserPosition.position.coords;
				options = {zoom:10, center: new OpenLayers.LonLat(pos.longitude, pos.latitude).transform("EPSG:4326", "EPSG:3857")};
            }
            else{
                options = {zoom:5, center: new OpenLayers.LonLat(-3.000, 39.328).transform("EPSG:4326", "EPSG:3857")};
            }

            mapControl = getNewMapControl(baseLayer, options);

            if(config.locationMode === "zoom"){
                mapControl.zoomToExtent(config.locationZoomBounds, true);
            }

            initialMapExtent = mapControl.getExtent();
        };

        var bindEventsInternal = function()
        {
            var that = app;

            $g("input[type='checkbox'], input[type='radio']").on("change", function()
            {
                _(that).emit('userChanged', [false]);
            });

            mapControl.events.on({"moveend" : function(){ 
                _(this).emit("userChanged", [true]);
            }, scope: app});

            $g("#" + AlertsListClientId).on("click", "div.item", function(ee)
            {
                _(that).emit('doZoom', [$g(this).attr("data-id")]);
            });

            $g("#open-config").on("click", function(ee)
            {
                ee.preventDefault();
                _(that).emit('openConfig');
            });

            $g("#" + AlertsListClientId).on("mouseenter", "div.item", function(ee)
            {
                _(that).emit('doOver', [$g(this).attr("data-id")]);
            });

            chrome.extension.onMessage.addListener(function(req){
                if(req.eventName === "newAlerts"){
                    _(that).emit('newAlerts');
                }
            });

            $g("#" + RefreshId).on("click", function(ee){
                ee.preventDefault();
                window.location.reload();
            });

            $g("#" + ChangeSourceId).on("click", function(ee){
                ee.preventDefault();
                _(that).emit('changeSource');
            });

            $g("#" + GoInitialViewId).on("click", function(ee){
                ee.preventDefault();
                _(that).emit('goInitialView');
            });

            $g("#" + GoFullViewId).on("click", function(ee){
                ee.preventDefault();
                _(that).emit('goFullView');
            });

            $g("#" + AlertsListClientId).on("click", "div.save", function(ee)
            {
                ee.preventDefault();
                _(that).emit('saveToHistorical', [$g(this).siblings("div[data-id]").attr("data-id")]);
            });

            $g("#" + AlertsListClientId).on("click", "div.remove", function(ee)
            {
                ee.preventDefault();
                _(that).emit('removeFromHistorical', [$g(this).siblings("div[data-id]").attr("data-id")]);
            });

            $g("#" + ChangeMapTypeClientId).on("click", function(ee)
            {
                ee.preventDefault();
                _(that).emit('changeMapType');
            });

        };

        var ensureMapIcons = function(){
            if(mapIcons !== null)
                return;

            mapIcons = [];

            var size = new OpenLayers.Size(32,37);
            var offset = new OpenLayers.Pixel(-(size.w/2), -size.h);

            _.each(staticData.levels, function(level){
                _.each(staticData.types, function(type){
                    var icon = new OpenLayers.Icon(_.sprintf("images/%s/%s.png", level.key, type.key)
                        , size, offset);
                    icon.key = level.key + "_" + type.key;
                    mapIcons.push(icon);
                });
            });
        };

        var getIconByAlert = function(a)
        {
            ensureMapIcons();

            return _.find(mapIcons, function(icon){
                return icon.key === a.lv + "_" + a.tp;
            }).clone();
        };

        var getAlertByRef = function(ref)
        {
            return _.find(currentSourceData.items, function(a){
                return a.ref === ref;
            });
        };

        var anyNewAlert = function()
        {
            if(currentSourceData === null || currentSourceData.items === null)
                return false;

            return !_.isUndefined(_.find(currentSourceData.items, function(a){
                return a.isNew === true;
                })
            );
        };

        var clearMarkersOnMap = function()
        {
            if(mapMarkers != null)
            {
                mapMarkers.destroy();
                mapMarkers = null;
            }
        };

        var addMarkersToMap = function()
        {
            clearMarkersOnMap();

             mapMarkers = new OpenLayers.Layer.Markers("Markers");
             mapControl.addLayer(mapMarkers);

            _.each(currentSourceData.items, function(a)
            {
                var marker = new OpenLayers.Marker(
                    new OpenLayers.LonLat(a.y,a.x).transform("EPSG:4326", "EPSG:3857"),
                    getIconByAlert(a));
                marker.ref = a.ref;
                marker.icon.imageDiv.title = utils.getTitleText(a);
                mapMarkers.addMarker(marker);
            });

            if(lastUserPosition != null && currentSource === 0)
            {
                var size   = new OpenLayers.Size(32,37);
                var offset = new OpenLayers.Pixel(-(size.w/2), -size.h);
                var icon = new OpenLayers.Icon(_.sprintf("images/%s.png", "start"), size, offset);

				var pos = lastUserPosition.position.coords;
                var userMarker = new OpenLayers.Marker(new OpenLayers.LonLat(pos.longitude, pos.latitude).transform("EPSG:4326", "EPSG:3857"), icon);
                userMarker.ref = -1;
                userMarker.icon.imageDiv.title = getMsg("pop_you_here");
                mapMarkers.addMarker(userMarker);
            }
        };

        var setSummaryTitle = function()
        {
            var $title   = $g("#summary-title");
            var $titleEx = $g("#summary-title-ex");

            var $subtitle = $g("#summary-subtitle");
            var $subtitleEx = $g("#summary-subtitle-ex");

            $subtitle.text(_.sprintf(utils.getMsg("pop_totals_f"), currentSourceData.items.length));

            if(currentSource === 0)
            {
                $title.text(utils.getMsg("pop_actual"));
                $titleEx.text(_.sprintf(utils.getMsg("pop_actual_ex_f"), currentSourceData.dateVersion_fc));
                
                var alertsNews  = _.countBy(currentSourceData.items, function(item){ return item.isNew === true ? "newsCount" : "oldsCount"});

                if(!_.isUndefined(alertsNews.newsCount)
                        && alertsNews.newsCount > 0)
                {
                    var text = utils.getMsg("pop_actual_new1");

                    if(alertsNews.newsCount > 1){
                        text =_.sprintf(utils.getMsg("pop_actual_news_f"), alertsNews.newsCount);
                    }

                    $subtitleEx.text(text);
                }

                return;
            }

            $title.text(utils.getMsg("pop_hco"));
            $titleEx.empty();
            $subtitleEx.empty();
        };

        this.getFilteredItems = function()
        {
            return filteredItems;
        };

        this.setAlertsDataSource = function(newDataSource, emitChange, asyncResponse)
        {
            if(currentSource === newDataSource)
                return;

            isChangeEventCancelled = true;

            clearAlertsList();
            clearMarkersOnMap();

            userOptions = _.deepClone(initialUserOptions, true);
            applyUserFilters();

            var $elmsToUpdate = $g("#" + OldNewsClientId + ",#" + GoInitialViewId);

            if(newDataSource === 1){$elmsToUpdate.hide();}
            else{$elmsToUpdate.show();}

            $g("#" + RefreshId).hide();

            var historicalData = null;

            if(newDataSource === 1)
            {
                if(_.isUndefined(asyncResponse))
                {
                    var that = app;

                    refreshHistoricalData(function(resp){
                        that.setAlertsDataSource(1, true, resp);
                    });

                    return;
                }

                if(asyncResponse.error === true){
                    return;
                }

                historicalData = {dateVersion: 0, dateVersion_fc: '01/01/1999', items:asyncResponse.items}
            }

            currentSource = newDataSource;
            currentSourceData = newDataSource === 0 ? trafficApp.getAlertsData() : historicalData;
            
            if(currentSourceData === null){
                currentSourceData = {dateVersion: 0, dateVersion_fc: '01/01/1999', items:[]};
            }

            filteredItems = currentSourceData.items;

            setSummaryTitle();
            addMarkersToMap();
            prepareUniqueProvs();

            if(newDataSource === 1){
                mapControl.zoomToExtent(staticData.spainFullExtentPopup, true);
            }

            isChangeEventCancelled = false;

            if(!_.isUndefined(emitChange) && emitChange === true)
            {
                _(this).emit('userChanged', [false]);
            }
            else if(userOptions.useMarkersExtent === true
                    && mapMarkers != null  
                        && (mapMarkers.markers !== null && mapMarkers.markers.length> 0))
            {
                var markersExtent = mapMarkers.getDataExtent();

                mapControl.zoomToExtent(markersExtent, false);

                initialMapExtent = markersExtent;
            }
        };

        this.translateStatic = function()
        {
           $g('[data-msg-static-text],[data-msg-static-title]').each(function(){
                var $t    = $g(this);
                var text  = $t.attr("data-msg-static-text");
                var title = $t.attr("data-msg-static-title");

                if(!_.isUndefined(text)){
                    $t.text(getMsg(text));
                }

                if(!_.isUndefined(title)){
                    $t.attr("title", getMsg(title));
                }
            }
           );
       };

        this.buildInputLists = function()
        {
           var sortingItems = staticData.sorting;

           if(lastUserPosition === null)
                sortingItems = _.filter(sortingItems, function(s){ return s.key !=="proximity"});

           buildList(SortingClientId, sortingItems, null, "radio");
           buildList(OldNewsClientId, staticData.oldnews, utils.getMsg("pop_list_oldnews"));
           buildList(LevelsClientId, staticData.levels, utils.getMsg("pop_list_levels"));
           buildList(TypesClientId, staticData.types, utils.getMsg("pop_list_types"));
        };

        this.buildControls = function()
        {
            buildMapControl();
        };

        this.bindEvents = function()
        {
            bindEventsInternal();
        };

        this.applyUserOptions = function()
        {
            applyUserFilters();
        };

        this.getLastUserPosition = function()
        {
            return lastUserPosition;
        };

        this.setUserPosition = function(callBack)
        {
            var that = this;

            geolocation.getCurrentPosition(
                function(position)
                {
                    lastUserPosition = {
                            position: position, 
                            lonLat: new OpenLayers.LonLat(position.coords.longitude, position.coords.latitude)
                    };

                    callBack.call(that);
                }
                ,function(geoError)
                {
                    console.log(geoError);

                    callBack.call(that);
                }
            );
        };

        this.unBindEvents = function()
        {
            $g("input[type='checkbox'], input[type='radio']").off("change");

            $g("#open-config").off("click");

            $g("#" + AlertsListClientId).off("click", "div.item");
            $g("#" + AlertsListClientId).off("mouseenter", "div.item");
            $g("#" + AlertsListClientId).off("click", "div.save");
            $g("#" + AlertsListClientId).off("click", "div.remove");

            $g("#" + RefreshId).off("click");
            $g("#" + GoInitialViewId).off("click");
            $g("#" + GoFullViewId).off("click");

            _(this).removeEvent('userChanged');
            _(this).removeEvent('doZoom');
            _(this).removeEvent('doOver');
            _(this).removeEvent('openConfig');
            _(this).removeEvent('newAlerts');
            _(this).removeEvent('changeSource');
            _(this).removeEvent('goInitialView');
            _(this).removeEvent('goFullView');
            _(this).removeEvent('saveToHistorical');
            _(this).removeEvent('removeFromHistorical');
            _(this).removeEvent('changeMapType');
        };

        this.init = function()
        {
            tryCreateDataBases();

            if(options.mode !== 0) //AUTO
                return;

            this.translateStatic();
            this.buildInputLists();
            this.buildControls();

            this.setAlertsDataSource(options.alertsDataSource);

            if(userOptions !== null){
                this.applyUserOptions();
            }

            this.bindEvents();

            _(this).on('userChanged', handleUserChange);
            _(this).on('doZoom', handleDoZoom);
            _(this).on('doOver', handleDoOver);
            _(this).on('openConfig', handleOpenConfig);
            _(this).on('newAlerts', handleNewAlerts);
            _(this).on('changeSource', handleChangeSource);
            _(this).on('goInitialView', handleGoInitialView);
            _(this).on('goFullView', handleGoFullView);
            _(this).on('saveToHistorical', handleSaveToHistorical);
            _(this).on('removeFromHistorical', handleRemoveFromHistorical);
            _(this).on('changeMapType', handlechangeMapType);

            if(userOptions !== null){
                _(this).emit('userChanged', [false]);
            }
        };
    };

}).call(this);