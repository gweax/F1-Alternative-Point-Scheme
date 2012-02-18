/*jslint forin:true */ 
/*global Event:false, window:false, localStorage:false */

(function () {
    
    var observers = {};

    function publish(type, event) {
        var typeObservers = observers[type];

        if (typeObservers) {
            typeObservers.forEach(function (observer) {
                try {
                    observer(event);
                }
                catch (e) {
                }
            });
        }
    }

    function subscribe(type, callback) {
        if (!observers[type]) {
            observers[type] = [];
        }

        if (typeof callback === "function") {
            observers[type].push(callback);
        }
    }

    function unsubscribe(type, callback) {
        var typeObservers, i;

        typeObservers = observers[type];

        if (typeObservers) {
            i = typeObservers.indexOf(callback);

            if (i !== -1) {
                typeObservers.splice(i, 1);
            }
        }
    }

    window.Event = {
        "publish" : publish,
        "subscribe" : subscribe,
        "unsubscribe" : unsubscribe
    };
    
}());


(function () {

    /* controller */

    var system, season;
    
    function calculatePoints(driver, system) {
        driver.points = driver.results.map(function (position) {
            return system.finish[position] || "-";
        });
        
        driver.total = driver.points.reduce(function (sum, i) {
            return typeof i === "number" ? sum + i : sum;
        }, 0);
        
        return driver;
    }
    
    function sortByTotal(a, b) {
        return b.total - a.total;
    }
    
    function calculateStandings() {
        var tableData = {}, drivers = [], driverId, driver;
    
        if (!(system && season)) {
            return;
        }
        
        // calculate points
        for (driverId in season) {
            driver = season[driverId];
            calculatePoints(driver, system);
            drivers.push(driver);
        }
        
        drivers.sort(sortByTotal);

        // create table data
        tableData = {
            "head" : ["Driver"].concat(drivers[0].results.map(function (r, i) {
                return i + 1;
            })).concat(["total"]),
            
            "body" : drivers.map(function (driver) {
                return [driver.name].concat(driver.points).concat([driver.total]);
            })
        };
        
        Event.publish("tableDataChanged", tableData);
    }
    
    function handleSystem(data) {
        system = data;
        calculateStandings();
    }
    
    function handleSeason(data) {
        season = data;
        calculateStandings();
    }
    
    Event.subscribe("systemChange", handleSystem);
    Event.subscribe("seasonLoaded", handleSeason);

}());



(function () {

    /* model */
    
    var seasons = {},
        seasonUrl = "http://ergast.com/api/f1/${season}/results.json?limit=500&callback=handleData",
        lastUrl = "http://ergast.com/api/f1/current/last.json?callback=handleLast",
        currentSeason,
        currentSeasonLoaded = false;
        
    function loadScript(url) {
        var script = document.createElement("script");
        script.src = url;
        document.body.appendChild(script);
    }
    
    function createDriver(data, drivers) {
        var driver = {
            "name" : data.givenName + " " + data.familyName,
            "results" : []
        };

        drivers[data.driverId] = driver;
        
        return driver;
    }
    
    function normalizeResults(driver, numberOfRaces) {
        driver.results.length = numberOfRaces;

        for (var i = 0; i < numberOfRaces; i++) {
            if (driver.results[i] === undefined) {
                driver.results[i] = "-";
            }
        }
    }

    function getDriversData(races) {
        var drivers = {}, driverId;
        
        races.forEach(function (raceData, raceIndex) {
            raceData.Results.forEach(function (data, position) {
                var driver = drivers[data.Driver.driverId] || createDriver(data.Driver, drivers);
                driver.results[raceIndex] = position;
            });
        });
        
        for (driverId in drivers) {
            normalizeResults(drivers[driverId], races.length);
        }
        
        return drivers;
    }
    
    window.handleData = function (data) {
        var season, races, drivers, driverId, fastestLaps;
        
        races = data.MRData.RaceTable.Races;
        drivers = getDriversData(races);
        season = data.MRData.RaceTable.season;
        
        seasons[season] = {
            "drivers" : drivers
        };
        localStorage.setItem("seasons", JSON.stringify(seasons));
        
        if (season === currentSeason) {
            currentSeasonLoaded = true;
        }

        Event.publish("seasonLoaded", drivers);
    };
    
    function loadSeason(season) {
        if (season in seasons && (season != currentSeason || currentSeasonLoaded)) {
            Event.publish("seasonLoaded", seasons[season].drivers);
        }
        else {
            loadScript(seasonUrl.replace("${season}", season));
        }
        localStorage.setItem("season", season);
    }
    
    seasons = JSON.parse(localStorage.getItem("seasons")) || {};
    
    function createOption(value) {
        var option = document.createElement("option");
        option.setAttribute("value", value);
        option.innerHTML = value;
        
        return option;
    }
    
    window.handleLast = function (data) {
        var lastDate;
    
        currentSeason = data.MRData.RaceTable.season;
        lastDate = data.MRData.RaceTable.Races[0].date;
        
        Event.publish("currentSeason", {
            "season" : currentSeason,
            "lastDate" : lastDate
        });
    };
    
    loadScript(lastUrl);
    
    Event.subscribe("seasonChange", loadSeason);

}());



(function () {

    /* table view */
    
    function createTable() {
        var table = document.createElement("table");
        table.appendChild(document.createElement("thead"));
        table.appendChild(document.createElement("tbody"));
        
        return table;
    }
    
    function createTableRow(data, head) {
        var tr = document.createElement("tr");

        data.map(function (value) {
            var cell = document.createElement(head ? "th" : "td");
            cell.innerHTML = value;
            return cell;
        }).forEach(function (cell) {
            tr.appendChild(cell);
        });

        return tr;
    }
    
    function createTableHead(table, data) {
        var thead = table.querySelector("thead");
        
        while (thead.firstChild) {
            thead.removeChild(thead.firstChild);
        }
        
        thead.appendChild(createTableRow(data, true));
    }
    
    function createTableBody(table, data) {
        var tbody = table.querySelector("tbody");
        
        while (tbody.firstChild) {
            tbody.removeChild(tbody.firstChild);
        }
        
        data.map(function (rowData) {
            return createTableRow(rowData);
        }).forEach(function (row) {
            tbody.appendChild(row);
        });
    }
    
    function updateTable(data) {
        var table = document.querySelector("table");
        
        if (!table) {
            table = createTable();
            document.querySelector("#table").appendChild(table);
        }
        
        createTableHead(table, data.head);
        createTableBody(table, data.body);
    }
    
    Event.subscribe("tableDataChanged", updateTable);

}());



(function () {

    /*
     * system select view
     */

    function createOption(data) {
        var option = document.createElement("option");
        option.setAttribute("value", data.from);
        option.innerHTML = data.from === "custom" ? "custom" : (data.from +
            ("until" in data ? " - " + data.until : "") +
            " (" + data.finish.join("-") +
            (data.fastest ? ", " + data.fastest + " for fastest lap" : "") +
            ")");
            
        return option;
    }
    
    var systems = [{
            "from" : "2010",
            "until" : "today",
            "finish" : [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]
        },
        {
            "from" : "2003",
            "until" : "2009",
            "finish" : [10, 8, 6, 5, 4, 3, 2, 1]
        },
        {
            "from" : "1991",
            "until" : "2002",
            "finish" : [10, 6, 4, 3, 2, 1]
        },
        {
            "from" : "1961",
            "until" : "1990",
            "finish" : [9, 6, 4, 3, 2, 1]
        },
        {
            "from" : "1960",
            "finish" : [8, 6, 4, 3, 2, 1]
        },
        {
            "from" : "1950",
            "until" : "1959",
            "finish" : [8, 6, 4, 3, 2],
            "fastest" : 1
        }/*,
        {
            "from" : "custom"
        }*/
    ];
    
    var systemsByKey = {};
    systems.forEach(function (s) {
        systemsByKey[s.from] = s;
    });
    
    var select = document.getElementById("system");
    systems.map(createOption).forEach(function (option) {
        select.appendChild(option);
    });
    
    var selectedSystem = localStorage.getItem("system");
    if (selectedSystem) {
        select.querySelector("[value='" + selectedSystem + "']").selected = true;
    }
    
    select.addEventListener("change", function (event) {
        var value = this.value;
        
        Event.publish("systemChange", systemsByKey[value]);
        localStorage.setItem("system", value);
    }, false);
    
    Event.publish("systemChange", systemsByKey[select.value]);
    
}());


(function () {
    
    /* season select view */
    
    function createOption(value) {
        var option = document.createElement("option");
        option.setAttribute("value", value);
        option.innerHTML = value;
        
        return option;
    }
    
    function handleSelect(event) {
        var value = this.value;
        localStorage.setItem("season", value);
        
        Event.publish("seasonChange", value);
    }
    
    function fillSelect(data) {
        var select, i, selectedSeason, currentSeason;
    
        currentSeason = +data.season;
        select = document.getElementById("season");
        
        for (i = currentSeason; i >= 1950; i--) {
            select.appendChild(createOption(i));
        }
        
        selectedSeason = localStorage.getItem("season") || currentSeason;
        select.querySelector("[value='" + selectedSeason + "']").selected =  true;
        select.addEventListener("change", handleSelect, false);
        
        Event.publish("seasonChange", selectedSeason);
    }
    
    Event.subscribe("currentSeason", fillSelect);
    
}());
