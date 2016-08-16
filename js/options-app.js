(function ()
{

    'use strict';

    var root = this;

    var OptionsApp = root.OptionsApp = function(appOptions)
    {
        if(_.isUndefined(appOptions)){
            throw new Error("appOptions argument is mandatory");
        }

        var LevelsClientId = "levels";
        var TypesClientId  = "types";
        var SoundsClientId = "sounds";

        var TreeClientId = "tree";
        var MapClientId  = "zoom";

        var app = this;
        var options = appOptions;
        var $parent = options.$container;
        var getMsg  = utils.getMsg;
        var trafficApp = options.browserManager.chrome.extension.getBackgroundPage().trafficApp;
        var geolocation = options.browserManager.navigator.geolocation;

        var mapControl  = null;
        var initialConfig = null;
        var lastUserLocation = null;
        var anyUserChange = false;

        var internalChangeEvent = false;

        var $g = function(selector)
        {
            return $parent.find(selector);
        };

        var baseLayerOptions =  
        {
            singleTile: true,
            ratio: 1,
            isBaseLayer: true,
            wrapDateLine: true,
            getURL: function() {
                var center = this.map.getCenter().transform("EPSG:3857", "EPSG:4326");
                var size   = this.map.getSize();

                return [
                    this.url, "&center=", center.lat, ",", center.lon,
                    "&zoom=", this.map.getZoom(), "&size=", size.w, "x", size.h
                    ].join("");
                }
        };

        var  isDecimal = function(s) {
           return String(s).search(/^\s*(\+|-)?((\d+(\.\d+)?)|(\.\d+))\s*$/) != -1;
        };

        var isInteger = function  (s) {
           return String(s).search (/^\s*(\+|-)?\d+\s*$/) != -1;
        };

        var string_comparator = function(param_name, compare_depth) {
            if (param_name[0] == '-') {
                param_name = param_name.slice(1),
                compare_depth = compare_depth || 10;
                return function (item) {
                     return String.fromCharCode.apply(String,
                        _.map(item[param_name].slice(0, compare_depth).split(""), function (c) {
                            return 0xffff - c.charCodeAt();
                        })
                    );
                };
            } else {
                return function (item) {
                    return item[param_name];
                };
            }
        };

        var getDataTree = function()
        {
            var locationTree = {
                title :  "Todos",
                children:[]
            };

            var wrappedCcaas = _.map(staticData.ccaas,
                function(ccaa)
                {
                    var wrapCa = {title:getMsg(ccaa.msg), key: ccaa.key + 1000, children:[]};

                    var wrappedProvs = _.map(ccaa.provs, function(prov){
                        return {title:getMsg(prov.msg), key:prov.key};
                    });

                    wrapCa.children = _.sortBy(wrappedProvs, string_comparator('title'));

                    return wrapCa;
                });

            locationTree.children = _.sortBy(wrappedCcaas, string_comparator('title'));

            return locationTree;
        };

        var buildTreeControl = function()
        {
            var getLocationsTree = getDataTree();

            $g("#" + TreeClientId).dynatree({
                checkbox: true,
                selectMode: 3,
                children: getDataTree(),
                onSelect: function(select, node) {
                    if(!_.isUndefined(this.appReference))
                        _(this.appReference).emit("userChange"); 
                }
            });

        };

        var buildMapControl = function()
        {
             var mapCenter = new OpenLayers.LonLat(-3.697, 40.428).transform("EPSG:4326", "EPSG:3857");

             if(lastUserLocation !== null)
             {
                mapCenter = new OpenLayers.LonLat(lastUserLocation.coords.longitude
                                ,lastUserLocation.coords.latitude).transform("EPSG:4326", "EPSG:3857");
             }

             mapControl = new OpenLayers.Map({
                    div: MapClientId,
                    projection: "EPSG:3857",
                    layers: 
                    [
                        new OpenLayers.Layer.Grid(
                            "Google Static",
                            "http://maps.googleapis.com/maps/api/staticmap?sensor=false&maptype=roadmap&key=" + staticData.mapKey,
                            null, 
                            baseLayerOptions
                        )
                    ],
                    center: mapCenter,
                    numZoomLevels:22,
                    zoom: 5
                });

        };

        var buildList = function(cntid, list, type, propText, propVal, bindProp)
        {
            var $cnt = $g("#" + cntid).first();

            if(_.isUndefined(type))
                type = "checkbox";

            if(_.isUndefined(propText))
                propText = "msg";

            if(_.isUndefined(propVal))
                propVal = "key";

            var htmlBuffer = [];

            _.each(list, function(item)
            {
               var val  = item[propVal];
               var text = cntid === "levels" ? getMsg(item[propText] + "_max") : getMsg(item[propText]);
               var idCtrl = cntid + "_" + val;

               var dataAttribute = 'data-bind-val="' + cntid + '"';

               if(!_.isUndefined(bindProp))
                    dataAttribute = 'data-bind-val="' + bindProp + '"';

               htmlBuffer.push('<label for="' + idCtrl + '">' + text + '</label><input type="' + type + '" id="' + idCtrl + '"  ' + dataAttribute  + ' name="' + cntid + '_group" value="' + val + '" />');
            });

            $cnt.html(htmlBuffer.join(""));
        };

        var initAutoMode = function()
        {
           app.translate();
           app.buildInputLists();
           app.buildControls();
           app.bindData();
           app.bindEvents();

           if(!_.isUndefined(options.readyCallBack))
            options.readyCallBack();
        };

        var playSound = function($elm){
                var isChecked = $elm.is(':checked');
                
                if(!isChecked)
                    return;

                var srcFile = $elm.val();
                var $audio = $g("#audioNotifTest");
                var audioElm = $audio[0];

                audioElm.pause();

                if(srcFile === "speech")
                {
                    options.browserManager.chrome.tts.getVoices(function(voices)
                    {
                       var voiceName = "native";
                       var betterVoice = _.find(voices, function(v){return v.voiceName === "iSpeech"});

                        if(!_.isUndefined(betterVoice))
                            voiceName = betterVoice.voiceName;

                        options.browserManager.chrome.tts.speak(
                                getMsg("op_tts_example"),
                                {
                                    voiceName: voiceName,
                                    enqueue:false,
                                    pitch:1.0,
                                    rate: 0.5,
                                    volume: audioElm.volume
                                },
                                function(){
                                    if(options.browserManager.chrome.extension.lastError)
                                        console.log(options.browserManager.chrome.extension.lastError);
                                }
                        );
                    });

                    return;
                }
                
                $audio.attr("src", "audio/" + srcFile);

                audioElm.play();
        };

        var bindDataInternal = function()
        {
            $g('[data-bind-val]').each(function(){
                var $t   = $g(this);
                var val  = $t.val();
                var attrBind = $t.attr("data-bind-val");
                var attrBindProp = $t.attr("data-bind-elm-prop");

                var bindProp = initialConfig[attrBind];
                var isRadioOrCheckbox = $t.is("input[type='radio']") || $t.is("input[type='checkbox']");

                if(!_.isUndefined(attrBindProp)){
                    $t[0][attrBindProp] = bindProp;
                    return;
                }

                if(_.isArray(bindProp))
                {
                    if(_.indexOf(bindProp, parseInt(val, 0)) > -1)
                            $t.attr("checked", "checked");
                }
                else
                {
                    if(isRadioOrCheckbox)
                    {
                        if(_.isBoolean(bindProp))
                        {
                            if(bindProp === true)
                                $t.attr("checked", "checked");
                        }
                        else if(val == bindProp){
                            $t.attr("checked", "checked");
                        }
                    }
                    else
                         $t.val(bindProp);
                }
           });

            var tree = $g("#tree").dynatree("getTree");

            _.each(initialConfig.locationProvs
                , function(prov){ tree.selectKey(prov, true); });
          
            if(initialConfig.locationZoomBounds.length > 0)
                mapControl.zoomToExtent(initialConfig.locationZoomBounds, true);
        };

        var bindEventsInternal = function()
        {
           $g("input").on("change", {context: app} ,function(evt)
           {
                var $t = $g(this);    
                var id = $t.attr("id");
                var $speechElms = $g("#speech,#speechMore");

                if(_.startsWith(id, "sounds_"))
                {
                    if(chrome.tts.isSpeaking)
                        chrome.tts.stop();

                    if(id === "sounds_speech")
                        $speechElms.fadeIn();
                    else
                        $speechElms.hide();
                }

                _(evt.data.context).emit("userChange");

           });

           mapControl.events.on({"moveend" : function(){ 
            _(this).emit("userChange");
            }, scope: app});

            var tree = $g("#tree").dynatree("getTree");
            tree["appReference"] = app; 
        };

        var bindUIEventsInternal = function()
        {
            $g("input[data-disable-nested]").on("change", {context:app}, function(evt){
                var $t = $g(this);
                var isChecked = $t.is(":checked");

                $t.siblings("div.nested").fadeTo("slow", isChecked ? 1 : 0.5).find("input").each(
                        function(){
                            var $tt = $g(this);
                            if(!isChecked){$tt.attr("disabled", true);}else{$tt.removeAttr("disabled");}
                        }
                );
            });

            $g("input[data-show-hide-filter]").on("change", {context:app}, function(evt)
            {
                var $t  = $g(this);
                var val = $t.val();
                var $parentCnt  = $t.parent();
                var $nextSbling = $parentCnt.siblings("div:first");
                var isChecked = $t.is(":checked");

                if(isChecked){
                    $nextSbling.slideDown("slow");
                }
                else{
                    $nextSbling.slideUp("slow");
                }

                if(isChecked){
                    internalChangeEvent = true;
                    $g("input[data-show-hide-filter][value!=" + val + "]").trigger("change");
                    internalChangeEvent = false;
                }
            });

            $g("input[name='sounds_group']").change(function(){playSound($g(this));});

            $g("#rngNotificationsSoundVolume").change(function(e, stepVal) 
            {
                if(typeof(stepVal) == "undefined"){stepVal = this.value;}
                
                var newValue = parseFloat(stepVal).toFixed(1);
                
                $g(this).next("input[type='text']").val(newValue);

                $g("#audioNotifTest")[0].volume = newValue;
            });

            $g("form").on("submit", function(evt)
            {
                evt.preventDefault();

                if(!anyUserChange)
                    return;

                _(app).emit("userSaving");
            }); 
        };

        var triggerUIEventsInternal = function()
        {
            internalChangeEvent = true;

            $g("input[data-disable-nested]").trigger("change");
            $g("input[data-show-hide-filter]").trigger("change");

            internalChangeEvent = false;
        };

        var getConfigFromControls = function()
        {
            var tempConfig = _.deepClone(initialConfig, true);

            tempConfig.types.length = 0;
            tempConfig.levels.length = 0;

            $g('[data-bind-val]').each(function(){
                var $t   = $g(this);

                if(!_.isUndefined($t.attr("readonly")) || $t.attr("id") === "audioNotifTest")
                    return;

                var val  = $t.val().trim();
                var attrBind = $t.attr("data-bind-val");
                var bindProp = tempConfig[attrBind];
                var isRadioOrCheckbox = $t.is("input[type='radio']") || $t.is("input[type='checkbox']");
                var isChecked =  isRadioOrCheckbox && $t.is(":checked") && !$t.is(":disabled");

                if(_.isArray(bindProp))
                {
                    if(isChecked)
                            tempConfig[attrBind].push(parseInt(val, 0));
                }
                else
                {
                    if(isRadioOrCheckbox)
                    {
                        if(_.isBoolean(bindProp)){
                            tempConfig[attrBind] =  isChecked;
                        }
                        else if(isChecked){
                           tempConfig[attrBind] = val;
                        }
                    }
                    else
                    {
                        if(val.indexOf(".") != -1 && isDecimal(val))  
                            tempConfig[attrBind] = parseFloat(val);
                        else if(isInteger(val)) 
                           tempConfig[attrBind] = parseInt(val, 0);
                       else
                            tempConfig[attrBind] = val;
                    }
                }
           });
            
             tempConfig.locationProvs.length = 0;

            _.each($g("#tree").dynatree("getSelectedNodes")
                , function(item)
                {
                    if(item.data.children === null){
                        tempConfig.locationProvs.push(item.data.key);
                    }
                });

            tempConfig.locationZoomBounds.length = 0;
           
            var extent = mapControl.getExtent();

            tempConfig.locationZoomBounds.push(extent.left);
            tempConfig.locationZoomBounds.push(extent.bottom);
            tempConfig.locationZoomBounds.push(extent.right);
            tempConfig.locationZoomBounds.push(extent.top);

            return tempConfig;

        };

        var handleUserChange = function()
        {
            if(internalChangeEvent === true)
                return;

            var configFromControls = getConfigFromControls();

            anyUserChange = !_.isEqual(initialConfig,  configFromControls);

            var $h1 = $g("h1");
  
            if(anyUserChange && !$g(".btnSave").is(":visible"))
            {
                $g(".btnSave").fadeIn("slow");
            }
            else if(!anyUserChange)
            {
                $g(".btnSave").fadeOut("slow");
            }
        };

        var handleUserSaving = function()
        {
            if(!anyUserChange)
                return;

            var newConfig = getConfigFromControls();

            newConfig.isDefault = false;

            trafficApp.saveNewConfig(newConfig);

            if(options.closeOnSave){
                window.close();
            }
        };

        this.AnyUserChange = function()
        {
            return anyUserChange;
        };

        this.bindData = function()
        {
            bindDataInternal();
        };

        this.bindEvents = function()
        {
            bindEventsInternal();
            bindUIEventsInternal();
            triggerUIEventsInternal();
        };

        this.translate = function()
        {
           $g('[data-msg-text],[data-msg-title]').each(function(){
                var $t    = $g(this);
                var text  = $t.attr("data-msg-text");
                var title = $t.attr("data-msg-title");

                if(!_.isUndefined(text))
                    $t.text(getMsg(text));

                if(!_.isUndefined(title)){
                    $t.attr("title", getMsg(title));

                    var opAttr = $t.attr("data-msg-title-op");
                    
                    if(_.isUndefined(opAttr))
                        $t.qtip();
                    else
                        $t.qtip(JSON.parse(opAttr));
                }
           });
       };

        this.buildInputLists = function()
        {
           buildList(LevelsClientId, staticData.levels);
           buildList(TypesClientId, staticData.types);
           buildList(SoundsClientId, staticData.sounds, "radio", "msg", "file", "notificationsSoundFile");
        };

        this.buildControls = function()
        {
            buildTreeControl();
            buildMapControl();
        };

        this.init = function()
        {
           initialConfig = trafficApp.getConfig();

           if(options.mode !== 0) //0 AUTO
                return;

           geolocation.getCurrentPosition(function(position){
                lastUserLocation = position;
                initAutoMode();
           }, 
           function(error){
                lastUserLocation = null;
                console.log(error);
                initAutoMode();
           });

           _(this).on("userChange", handleUserChange);
           _(this).on("userSaving", handleUserSaving);

        };

    };

}).call(this);