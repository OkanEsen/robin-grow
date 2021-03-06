// ==UserScript==
// @name         Robin Grow
// @namespace    http://tampermonkey.net/
// @version      1.860
// @description  Try to take over the world!
// @author       /u/mvartan
// @include      https://www.reddit.com/robin*
// @updateURL    https://github.com/vartan/robin-grow/raw/master/robin.user.js
// @require       http://ajax.googleapis.com/ajax/libs/jquery/1.9.1/jquery.min.js
// @grant   GM_getValue
// @grant   GM_setValue
// @grant   GM_addStyle
// ==/UserScript==
(function() {
    // Styles
    GM_addStyle('.robin--username {cursor: pointer}');

    // Utils
    function hasChannel(source, channel) {
        channel = String(channel).toLowerCase();
        return String(source).toLowerCase().startsWith(channel);
    }

    function formatNumber(n) {
        var part = n.toString().split(".");
        part[0] = part[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        return part.join(".");
    }

    function addMins(date, mins) {
        var newDateObj = new Date(date.getTime() + mins * 60000);
        return newDateObj;
    }

    function howLongLeft(endTime) {
        if (endTime === null) {
            return 0;
        }
        try {
            return Math.floor((endTime - new Date()) / 60 / 1000 * 10) / 10;
        } catch (e) {
            return 0;
        }
    }

    var Settings = {
        setupUI: function() {
            $robinVoteWidget.prepend("<div class='addon'><div class='usercount robin-chat--vote' style='font-weight:bold;pointer-events:none;'></div></div>");
            $robinVoteWidget.prepend("<div class='addon'><div class='timeleft robin-chat--vote' style='font-weight:bold;pointer-events:none;'></div></div>");
            // Open Settings button
            $robinVoteWidget.append('<div class="addon"><div class="robin-chat--vote" style="font-weight: bold; padding: 5px;cursor: pointer;" id="openBtn">Open Settings</div></div>');
            // Setting container
            $(".robin-chat--sidebar").before(
                '<div class="robin-chat--sidebar" style="display:none;" id="settingContainer">' +
                    '<div class="robin-chat--sidebar-widget robin-chat--vote-widget" id="settingContent">' +
                        '<div class="robin-chat--vote" style="font-weight: bold; padding: 5px;cursor: pointer;" id="closeBtn">Close Settings</div>' +
                    '</div>' +
                '</div>'
            );

            $("#robinDesktopNotifier").detach().appendTo("#settingContent");

            $("#openBtn").on("click", function openSettings() {
                $(".robin-chat--sidebar").hide();
                $("#settingContainer").show();
            });

            $("#closeBtn").on("click", function closeSettings() {
                $(".robin-chat--sidebar").show();
                $("#settingContainer").hide();
            });

            function setVote(vote) {
                return function() {
                    settings.vote = vote;
                    Settings.save(settings);
                };
            }
            $(".robin-chat--vote.robin--vote-class--abandon").on("click", setVote("abandon"));
            $(".robin-chat--vote.robin--vote-class--continue").on("click", setVote("stay"));
            $(".robin-chat--vote.robin--vote-class--increase").on("click", setVote("grow"));

            $('.robin-chat--buttons').prepend("<div class='robin-chat--vote robin--vote-class--novote'><span class='robin--icon'></span><div class='robin-chat--vote-label'></div></div>");
            $robinVoteWidget.find('.robin-chat--vote').css('padding', '5px');
            $('.robin--vote-class--novote').css('pointer-events', 'none');
        },

        load: function loadSetting() {
            var setting = localStorage["robin-grow-settings"];

            try {
                setting = setting ? JSON.parse(setting) : {};
            } catch(e) {}

            setting = setting || {};

            if (!setting.vote)
                setting.vote = "grow";

            return setting;
        },

        save: function saveSetting(settings) {
            localStorage["robin-grow-settings"] = JSON.stringify(settings);
        },

        addBool: function addBoolSetting(name, description, defaultSetting) {
            defaultSetting = settings[name] || defaultSetting;

            $("#settingContent").append('<div class="robin-chat--sidebar-widget robin-chat--notification-widget"><label><input type="checkbox" name="setting-' + name + '">' + description + '</label></div>');
            $("input[name='setting-" + name + "']").on("click", function() {
                settings[name] = !settings[name];
                Settings.save(settings);
            });
            if (settings[name] !== undefined) {
                $("input[name='setting-" + name + "']").prop("checked", settings[name]);
            } else {
                settings[name] = defaultSetting;
            }
        },

        addInput: function addInputSetting(name, description, defaultSetting) {
            defaultSetting = settings[name] || defaultSetting;

            $("#settingContent").append('<div id="robinDesktopNotifier" class="robin-chat--sidebar-widget robin-chat--notification-widget"><label><input type="text" name="setting-' + name + '"><br>' + description + '</label></div>');
            $("input[name='setting-" + name + "']").prop("defaultValue", defaultSetting)
            .on("change", function() {
                settings[name] = $(this).val();
                Settings.save(settings);
            });
            settings[name] = defaultSetting;
        }
    };

    var currentUsersName = $('div#header span.user a').html();

    // Settings
    var $robinVoteWidget = $("#robinVoteWidget");

    // IF the widget isn't there, we're probably on a reddit error page.
    if (!$robinVoteWidget.length) {
        // Don't overload reddit, wait a bit before reloading.
        setTimeout(function() {
            window.location.reload();
        }, 15000);
        return;
    }

    Settings.setupUI($robinVoteWidget);
    var settings = Settings.load();

    // Options begin
    Settings.addBool("removeSpam", "Remove bot spam", true);
    Settings.addBool("findAndHideSpam", "Remove messages that have been sent more than 3 times", true);
    Settings.addInput("maxprune", "Max messages before pruning", "500");
    Settings.addInput("spamFilters", "Custom spam filters, comma delimited.", "spam example 1, spam example 2");
    Settings.addInput("channel", "Channel filter", "");
    Settings.addBool("filterChannel", "Filter by channel", false);
    // Options end

    // Add version at the end (if available from script engine)
    var versionString = "";
    if (typeof GM_info !== "undefined") {
        versionString = " - v" + GM_info.script.version;
    }
    $("#settingContent").append('<div class="robin-chat--sidebar-widget robin-chat--report" style="text-align:center;"><a target="_blank" href="https://github.com/vartan/robin-grow">robin-grow' + versionString + '</a></div>');
    // Settings end

    var timeStarted = new Date();
    var name = $(".robin-chat--room-name").text();
    var urlRegex = new RegExp(/(?:(?:https?|ftp):\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,}))\.?)(?::\d{2,5})?(?:[/?#]\S*)?/ig);

    var list = {};
    $(".text-counter-input").val(settings.filterChannel? settings.channel+" " :"");
    $(".text-counter-input").keyup(function() {
        if(settings.filterChannel && $(".text-counter-input").val().indexOf(settings.channel) !== 0) {
            $(".text-counter-input").val(settings.channel+" "+$(".text-counter-input").val());
        }
    });

    $(".text-counter-input").keydown(function(e) {
        var code = e.keyCode || e.which;
        if(code === 13) {
            if(settings.filterChannel && String(settings.channel).length > 0) {
                setTimeout(function() {
                    $(".text-counter-input").val(settings.channel + " ");
                }, 10);
            }
        }
    });

    var isEndingSoon = false;
    var endTime = null;

    // Grab the timestamp from the time remaining message and then calc the ending time using the estimate it gives you
    function getEndTime() { // mostly from /u/Yantrio, modified by /u/voltaek
        var remainingMessageContainer = $(".robin--user-class--system:contains('approx')");
        if (remainingMessageContainer.length === 0) {
            // for cases where it says "soon" instead of a time on page load
            var endingSoonMessageContainer = $(".robin--user-class--system:contains('soon')");
            if (endingSoonMessageContainer.length !== 0) {
                isEndingSoon = true;
            }
            return null;
        }
        var message = $(".robin-message--message", remainingMessageContainer).text();
        var time = new Date($(".robin-message--timestamp", remainingMessageContainer).attr("datetime"));
        try {
            return addMins(time, message.match(/\d+/)[0]);
        } catch (e) {
            return null;
        }
    }

    endTime = getEndTime();

    function update() {
        switch(settings.vote) {
            case "abandon":
                $(".robin-chat--vote.robin--vote-class--abandon:not('.robin--active')").click();
                break;
            case "stay":
                $(".robin-chat--vote.robin--vote-class--continue:not('.robin--active')").click();
                break;
            default:
                $(".robin-chat--vote.robin--vote-class--increase:not('.robin--active')").click();
                break;
        }
        if (endTime === null && !isEndingSoon) {
            $(".timeleft").hide();
        }
        else {
            $(".timeleft").text(isEndingSoon ? "ending soon" : formatNumber(howLongLeft(endTime)) + " minutes remaining");
        }

        var users = 0;
        $.get("/robin/", function(a) {
            var start = "{" + a.substring(a.indexOf("\"robin_user_list\": ["));
            var end = start.substring(0, start.indexOf("}]") + 2) + "}";
            list = JSON.parse(end).robin_user_list;

            var counts = list.reduce(function(counts, voter) {
                counts[voter.vote] += 1;
                return counts;
            }, {
                INCREASE: 0,
                ABANDON: 0,
                NOVOTE: 0,
                CONTINUE: 0
            });

            $robinVoteWidget.find('.robin--vote-class--increase .robin-chat--vote-label').html('grow<br>(' + formatNumber(counts.INCREASE) + ')');
            $robinVoteWidget.find('.robin--vote-class--abandon .robin-chat--vote-label').html('abandon<br>(' + formatNumber(counts.ABANDON) + ')');
            $robinVoteWidget.find('.robin--vote-class--novote .robin-chat--vote-label').html('no vote<br>(' + formatNumber(counts.NOVOTE) + ')');
            $robinVoteWidget.find('.robin--vote-class--continue .robin-chat--vote-label').html('stay<br>(' + formatNumber(counts.CONTINUE) + ')');
            users = list.length;
            $(".usercount").text(formatNumber(users) + " users in chat");
        });
        var lastChatString = $(".robin-message--timestamp").last().attr("datetime");
        var timeSinceLastChat = new Date() - (new Date(lastChatString));
        var now = new Date();
        if (timeSinceLastChat !== undefined && (timeSinceLastChat > 60000 && now - timeStarted > 60000)) {
            window.location.reload(); // reload if we haven't seen any activity in a minute.
        }

        // Try to join if not currently in a chat
        if ($("#joinRobinContainer").length) {
            $("#joinRobinContainer").click();
            setTimeout(function() {
                $("#joinRobin").click();
            }, 1000);
        }
    }


    // http://stackoverflow.com/questions/1349404/generate-a-string-of-5-random-characters-in-javascript
    function makeid() {
        var text = "";
        var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

        for( var i=0; i < 5; i++ )
        text += possible.charAt(Math.floor(Math.random() * possible.length));

        return text;
    }

    //setInterval(function() {
    //if (parseInt(howLongLeft()) > 0) {
    //var votersCount = counts.INCREASE + counts.ABANDON + counts.CONTINUE;

    //$(".text-counter-input").val("Current standings [" + votersCount + "/" + users + "]: ABANDON: " + counts.ABANDON + ", STAY: " + counts.CONTINUE + ", GROW: " + counts.INCREASE + ", NO VOTE: " + counts.NOVOTE + " - " + formatNumber(howLongLeft()) + " minutes remaining - " + makeid()).submit();
    //$("#robinSendMessage > input[type='submit']").click();
    //}
    //}, 60000);

    // hash string so finding spam doesn't take up too much memory
    function hashString(str) {
        var hash = 0;

        if (str !== 0) {
            for (i = 0; i < str.length; i++) {
                char = str.charCodeAt(i);
                if (str.charCodeAt(i) > 0x40) { // Let's try to not include the number in the hash in order to filter bots
                    hash = ((hash << 5) - hash) + char;
                    hash = hash & hash; // Convert to 32bit integer
                }
            }
        }

        return hash;
    }


    /**
     * JS Implementation of MurmurHash2
     * 
     * @author <a href="mailto:gary.court@gmail.com">Gary Court</a>
     * @see http://github.com/garycourt/murmurhash-js
     * @author <a href="mailto:aappleby@gmail.com">Austin Appleby</a>
     * @see http://sites.google.com/site/murmurhash/
     * 
     * @param {string} str ASCII only
     * @param {number} seed Positive integer only
     * @return {number} 32-bit positive integer hash
     */

    function murmurhash2_32_gc(str, seed) {
        var
        l = str.length,
            h = seed ^ l,
            i = 0,
            k;

        while (l >= 4) {
            k = 
                ((str.charCodeAt(i) & 0xff)) |
                ((str.charCodeAt(++i) & 0xff) << 8) |
                ((str.charCodeAt(++i) & 0xff) << 16) |
                ((str.charCodeAt(++i) & 0xff) << 24);

            k = (((k & 0xffff) * 0x5bd1e995) + ((((k >>> 16) * 0x5bd1e995) & 0xffff) << 16));
            k ^= k >>> 24;
            k = (((k & 0xffff) * 0x5bd1e995) + ((((k >>> 16) * 0x5bd1e995) & 0xffff) << 16));

            h = (((h & 0xffff) * 0x5bd1e995) + ((((h >>> 16) * 0x5bd1e995) & 0xffff) << 16)) ^ k;

            l -= 4;
            ++i;
        }

        switch (l) {
                case 3: h ^= (str.charCodeAt(i + 2) & 0xff) << 16;
                case 2: h ^= (str.charCodeAt(i + 1) & 0xff) << 8;
                case 1: h ^= (str.charCodeAt(i) & 0xff);
                        h = (((h & 0xffff) * 0x5bd1e995) + ((((h >>> 16) * 0x5bd1e995) & 0xffff) << 16));
        }

        h ^= h >>> 13;
        h = (((h & 0xffff) * 0x5bd1e995) + ((((h >>> 16) * 0x5bd1e995) & 0xffff) << 16));
        h ^= h >>> 15;

        return h >>> 0;
    }

    // maintain spam list
    var spamList = {};
    var spamUserList = {};
    var spamMaxThreshold = 3;
    var spamUserMaxThreshold = 5;

    /*
     * @param {number} hash Positive integer only
     * Increment if message is already listed, otherwise init with 1
     */
    function updateSpamList(hash) {
        spamList[hash] = (spamList[hash]) ? ++spamList[hash] : 1;
    }

    /*
     * @param {string} user ASCI only
     * Increment if message is already listed, otherwise init with 1
     */
    function updateSpamUserList(user) {
        spamUserList[user] = (spamUserList[user]) ? ++spamUserList[user] : 1;
    }

    /*
     * @param {string} user ASCII only
     * Returns true if spamMaxThreshold is exceeded for given message
     */
    function isMessageSpam(hash) {
        return spamList[hash] >= spamMaxThreshold;
    }

    /*
     * @param {string} user ASCII only
     * Returns true if spamUserMaxThreshold is exceeded for given user
     */
    function isUserSpam(user) {
        return spamUserList[user] >= spamUserMaxThreshold;
    }

    // faster to save this in memory
    /* Detects unicode spam - Credit to travelton
     * https://gist.github.com/travelton */
    var UNICODE_SPAM_RE = /[\u0080-\uFFFF]/;
    function isBotSpam(text) {
        // starts with a [, has "Autovoter", or is a vote
        var filter =
            ~text.trim().indexOf("[") === -1 ||
            text.trim().toLowerCase().indexOf("voted to") !== -1 ||
            text.trim().toLowerCase().indexOf("autovoter") !== -1 ||
            (UNICODE_SPAM_RE.test(text));

        var spamFilters = settings.spamFilters.split(",").map(function(filter) { return filter.trim().toLowerCase(); });
        spamFilters.forEach(function(filterVal) {
            filter = filter || filterVal.length > 0 && text.toLowerCase().indexOf(filterVal) >= 0;
        });

        return filter;
    }

    function pruneOldMessages(messages) {
        var maxprune = parseInt(settings.maxprune || "1000", 10);
        if (maxprune < 10 || isNaN(maxprune)) {
            maxprune = 1000;
        }

        if (messages.length > maxprune) {
            var tempMessage = Array.prototype.slice.call(messages, 0, messages.length - maxprune);
            for (var i = 0, len_t = tempMessage.length; i < len_t; ++i)
                tempMessage[i].parentNode.removeChild(tempMessage[i]);
        }
    }

    // Individual mute button /u/verox-
    var mutedList = [];
    $('body').on('click', ".robin--username", function() {
        var username = $(this).text();
        var clickedUser = mutedList.indexOf(username);

        if (clickedUser === -1) {
            // Mute our user.
            mutedList.push(username);
            this.style.textDecoration = "line-through";
            listMutedUsers();
        } else {
            // Unmute our user.
            this.style.textDecoration = "none";
            mutedList.splice(clickedUser, 1);
            listMutedUsers();
        }
    });

    $("#settingContent").append("<span style='font-size:12px;text-align:center;'>Muted Users</label>");

    $("#settingContent").append("<div id='blockedUserList' class='robin-chat--sidebar-widget robin-chat--user-list-widget'></div>");

    function listMutedUsers() {

        $("#blockedUserList").remove();

        $("#settingContent").append("<div id='blockedUserList' class='robin-chat--sidebar-widget robin-chat--user-list-widget'></div>");

        for (var i = 0, len = mutedList.length; i < len; i++) {
            var mutedHere = "present";

            var userInArray = $.grep(list, function(e) {
                return e.name === mutedList[i];
            });

            if (userInArray[0].present === true) {
                mutedHere = "present";
            } else {
                mutedHere = "away";
            }

            $("#blockedUserList").append("<div class='robin-room-participant robin--user-class--user robin--presence-class--" + mutedHere + " robin--vote-class--" + userInArray[0].vote.toLowerCase() + "'></div>");
            $("#blockedUserList>.robin-room-participant").last().append("<span class='robin--icon'></span>");
            $("#blockedUserList>.robin-room-participant").last().append("<span class='robin--username' style='color:" + colorFromName(mutedList[i]) + "'>" + mutedList[i] + "</span>");

        }
    }


    // credit to wwwroth for idea (notification audio)
    // i think this method is better
    var notifAudio = new Audio("https://slack.global.ssl.fastly.net/dfc0/sounds/push/knock_brush.mp3");

    var myObserver = new MutationObserver(mutationHandler);
    myObserver.observe(document.getElementById("robinChatMessageList"), { childList: true});

    function mutationHandler(mutationRecords) {
        mutationRecords.forEach(function(mutation) {
            var jq = $(mutation.addedNodes);
            // There are nodes added
            if (jq.length > 0) {
                // prune if necessary
                if (jq[0].parentNode.children.length >= settings.maxprune) pruneOldMessages(jq[0].parentNode.children);
                // cool we have a message.
                var thisUser = $(jq[0].children && jq[0].children[1]).text();
                var $message = $(jq[0].children && jq[0].children[2]);
                var messageText = $message.text();
                var hash = murmurhash2_32_gc(messageText.toLowerCase());

                // if message was already classified as spam, check if user of current message is still spaming it and increment his counter
                if (isMessageSpam(hash) && !isUserSpam(thisUser)) {
                    updateSpamUserList(thisUser);
                    console.log(hash + ": " + spamList[hash] + " - " + "user: " + thisUser + " -> " + spamUserList[thisUser] + "; m: " + messageText);
                }

                var remove_message =
                    (mutedList.indexOf(thisUser) >= 0) ||
                    (settings.removeSpam && isBotSpam(messageText)) ||
                    (settings.filterChannel &&
                    !jq.hasClass('robin--user-class--system') &&
                    String(settings.channel).length > 0 &&
                    !hasChannel(messageText, settings.channel)) ||
                    isMessageSpam(hash) ||
                    isUserSpam(thisUser);

                var nextIsRepeat = jq.hasClass('robin--user-class--system') && messageText.indexOf("try again") >= 0;
                if(nextIsRepeat)
                    $(".text-counter-input").val(jq.next().find(".robin-message--message").text());

                remove_message = remove_message && !jq.hasClass("robin--user-class--system");
                if (remove_message) {
                    $message = null;
                    $(jq[0]).remove();
                } else {
                    if(settings.filterChannel) {
                        if(messageText.indexOf(settings.channel) === 0) {
                            $message.text(messageText.substring(settings.channel.length).trim());
                        }
                    }
                    if (messageText.toLowerCase().indexOf(currentUsersName.toLowerCase()) !== -1) {
                        $message.parent().css("background","#FFA27F").css("color","white");
                        notifAudio.play();
                        console.log("got new mention");
                    }
                    if(urlRegex.test(messageText)) {
                        urlRegex.lastIndex = 0;
                        var url = encodeURI(urlRegex.exec(messageText)[0]);
                        var parsedUrl = url.replace(/^/, "<a target=\"_blank\" href=\"").replace(/$/, "\">"+url+"</a>");
                        var oldHTML = $(jq[0]).find('.robin-message--message').html();
                        var newHTML = oldHTML.replace(url, parsedUrl);
                        $(jq[0]).find('.robin-message--message').html(newHTML);
                    }
                    updateSpamList(hash);
                    //findAndHideSpam();
                }
            }
        });
    }


    setInterval(update, 10000);
    update();

    var flairColor = [
        '#e50000', // red
        '#db8e00', // orange
        '#ccc100', // yellow
        '#02be01', // green
        '#0083c7', // blue
        '#820080'  // purple
    ];

    function colorFromName(name) {
        sanitizedName = name.toLowerCase().replace(/[^a-z0-9]/g, "");
        flairNum = parseInt(sanitizedName, 36) % 6;
        return flairColor[flairNum];
    }


    // Send message button
    $("#robinSendMessage").append('<div onclick={$(".text-counter-input").submit();} class="robin-chat--vote" style="font-weight: bold; padding: 5px;cursor: pointer; margin-left:0;" id="sendBtn">Send Message</div>'); // Send message
    $('#robinChatInput').css('background', '#EFEFED');

    // RES Night Mode support
    if ($("body").hasClass("res")) {
        $('<style>.res-nightmode .robin-message, .res-nightmode .robin--user-class--self .robin--username, .res-nightmode .robin-room-participant .robin--username, .res-nightmode :not([class*=flair]) > .robin--username, .res-nightmode .robin-chat .robin-chat--vote, .res-nightmode .robin-message[style="color: white; background: rgb(255, 162, 127);"] { color: #DDD; } .res-nightmode .robin-chat .robin-chat--sidebar, .res-nightmode .robin-chat .robin-chat--vote { background-color: #262626; } .res-nightmode #robinChatInput { background-color: #262626 !important; } .res-nightmode .robin-chat .robin-chat--vote { box-shadow: 0px 0px 2px 1px #888; } .res-nightmode .robin-chat .robin-chat--vote.robin--active { background-color: #444444; box-shadow: 1px 1px 5px 1px black inset; } .res-nightmode .robin-chat .robin-chat--vote:focus { background-color: #848484; outline: 1px solid #9A9A9A; } .res-nightmode .robin--user-class--self { background-color: #424242; } .res-nightmode .robin-message[style="color: white; background: rgb(255, 162, 127);"] { background-color: #520000 !important; } .res-nightmode .robin-chat .robin-chat--user-list-widget { overflow-x: hidden; } .res-nightmode .robin-chat .robin-chat--sidebar-widget { border-bottom: none; }</style>').appendTo('body');
    }
})();
