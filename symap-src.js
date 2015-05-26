
ss = require('simple-statistics');
turf = require('turf');
d3 = require('d3');
topojson = require('topojson');
textures = require('textures');



var margin = {top: 0, right: 0, bottom: 0, left: 0},
    w = 1920 - margin.right - margin.left,
    h = 1080 - margin.top - margin.bottom;

//SYMAP config
var numClasses = 7,
    gridRes = 4, //3
    fontSize = gridRes * 3,
    symapMode = 'contour',
    kyCounties = 'data/kyCountyPops.json',
    otherStates = 'data/kyAdjacent.json',
    textSymbology;

//Geo config
var mapCenter = [-85.76394,37.81914],
    parallels = [36,40],
    scale = 17000;


//GEO-SETUP!

//Define projection.
var projection = d3.geo.conicEqualArea()
    .rotate([-mapCenter[0], 0])
    .center([0,mapCenter[1]])
    .parallels(parallels)
    .scale(scale)
    .translate([w / 2, h / 2]);

//Define path generator.
var path = d3.geo.path()
    .projection(projection);

var zoom = d3.behavior.zoom()
            .translate([0, 0])
            .scale(1)
            .scaleExtent([1, 6])
            .size([w,h])
            .on("zoom", zoomed);

//Build map frame.
var svg = d3.select("#map")
            .append("svg")
            .attr("width", w)
            .attr("height", h);

var features = svg.append("g").attr("class","features");

//          Inverse Distance Weighting algorithm drawn from Shepard, Donald. 1968. “A
//          Two-Dimensional Interpolation Function for Irregularly-Spaced Data.” In
//          Proceedings of the Association for Computing Machinery National Conference,
//          517–24.

if (numClasses == 1) {
    textSymbology = ["."];
} else if (numClasses == 2) {
    textSymbology = [".", "OXAV"];
} else if (numClasses == 3) {
    textSymbology = [".","O","OXAV"];
} else if (numClasses == 4) {
    textSymbology = [".","+","O","OXAV"];
} else if (numClasses == 5) {
    textSymbology = [".","+","O","O-","OXAV"];
} else if (numClasses == 6) {
    textSymbology = [".","+","X","O-","OX","OXAV"];
} else if (numClasses == 7) {
    textSymbology = [".","'","+","X","O-","OX","OXAV"];
} else if (numClasses == 8) {
    textSymbology = [".","'","+","X","O","O-","OX","OXAV"];
} else if (numClasses == 9) {
    textSymbology = [".","'","=","+","X","O","O-","OX","OXAV"];
} else if (numClasses == 10) {
    textSymbology = [".","'","-","=","+","X","O","O-","OX","OXAV"];
}

d3.json(otherStates, function(error, adj) {

    if (error) return console.error(error);

    svg.call(zoom);

    var states = topojson.feature(adj, adj.objects.kyAdjacent).features;

    var t = textures.lines()
        .lighter()
        .thicker()
        .stroke("#ffffff");

    svg.call(t);

    features.append("g").attr("class","extBoundary")
        .selectAll("path")
        .data(states)
        .enter()
        .append("path")
        .style("fill", function(d) {
            if (d.properties["STATE_ABBR"]=="KY") {
                return "#b22222";
            } else { return t.url(); }
        })
        .style("fill-opacity", function(d) {
            if (d.properties["STATE_ABBR"]=="KY") {
                return 0.4;
            } else { return 0.2; }
        })
        .attr("d", path);
});

d3.json(kyCounties, function(ky) {

    svg.call(zoom);

    // LOAD COUNTIES AND PRODUCE CENTROIDS
    var counties = topojson.feature(ky, ky.objects.counties).features;

    var kyExtent = d3.geo.bounds(topojson.mesh(ky, ky.objects.counties, function(a, b) { return a === b; }));
    // REFORMAT BOUNDS FOR GENERATING POINT GRID
    kyExtent = [kyExtent[0][0],kyExtent[0][1],kyExtent[1][0],kyExtent[1][1]];

    // GENERATE POINT GRID
    var grid = turf.within(turf.pointGrid(kyExtent,gridRes,'kilometers'),turf.featurecollection(counties));

    var valueArray = [];
    var mapAttr;

    if (symapMode == "conformant") {
        for (i in grid.features) {
            for (j in counties) {
                if (turf.inside(grid.features[i],counties[j])) {
                    grid.features[i].properties.z = counties[j].properties.population;
                    valueArray[i] = counties[j].properties.population;
                    break;
                }
            }
        }
    } else if (symapMode == "contour") {

        var centroids = [];
        for(var i = 0; i < counties.length; i++) {
            centroids[i] = turf.point(
                turf.center(counties[i]).geometry.coordinates,
                {"z" : counties[i].properties.population}
            );
        }

//                  Inverse Distance Weighting algorithm drawn from Shepard, Donald. 1968. “A
//                  Two-Dimensional Interpolation Function for Irregularly-Spaced Data.” In
//                  Proceedings of the Association for Computing Machinery National Conference,
//                  517–24.

        // COMPUTE TOTAL AREA BY SUMMING COUNTIES
        var kyArea = 0;
        for (i in counties) kyArea += turf.area(counties[i]) / 1000000;

        // COMPUTE SEARCH RADIUS (SEE SHEPARD 1968, 519)
        r = Math.sqrt((7 * kyArea)/(Math.PI *  centroids.length));

        for (i in grid.features) {
            //distance of D_i from P
            for (j in centroids) {
                var dist = turf.distance(grid.features[i],centroids[j],'kilometers');
                centroids[j].properties.d = dist;
            }

            centroids.sort(function(a,b) {
                return a.properties.d - b.properties.d;
            });

            if (r < centroids[3].properties.d) {
                selCentroids = centroids.slice(0,4);
            } else if (r > centroids[3].properties.d && r <= centroids[9].properties.d) {
                for (n in centroids) {
                    if (r < centroids[n].properties.d) {
                        selCentroids = centroids.slice(0,n);
                        break;
                    }
                }
            } else {
                selCentroids = centroids.slice(0,10);
            }

            var r = Math.ceil(selCentroids[selCentroids.length-1].properties.d);

            var idw;
            var idwNum = 0;
            var idwDen = 0;

            for (cent_i in selCentroids) {
                var dist_i = selCentroids[cent_i].properties.d,
                    ix,
                    dist_ix,
                    iy,
                    dist_iy,
                    dist_j,
                    jx,
                    dist_jx,
                    jy,
                    dist_jy,
                    cos,
                    t_i,
                    t_iNum = 0,
                    t_iDen = 0,
                    s_i,
                    s_j,
                    w = selCentroids[cent_i].properties.w,
                    A_i = selCentroids[cent_i].properties.ai,
                    B_i = selCentroids[cent_i].properties.bi,
                    A_iB_i = selCentroids[cent_i].properties.aibi,
                    v,
                    dz_i;

                ix = turf.point([
                    selCentroids[cent_i].geometry.coordinates[0],
                    grid.features[i].geometry.coordinates[1]
                    ]);
                dist_ix = turf.distance(grid.features[i], ix, 'kilometers');

                if (selCentroids[cent_i].geometry.coordinates[0] < grid.features[i].geometry.coordinates[0]) {
                    dist_ix = -dist_ix;
                }

                iy = turf.point([
                    grid.features[i].geometry.coordinates[0],
                    selCentroids[cent_i].geometry.coordinates[1]
                    ]);
                dist_iy = turf.distance(grid.features[i], iy, 'kilometers');

                if (selCentroids[cent_i].geometry.coordinates[1] < grid.features[i].geometry.coordinates[1]) {
                    dist_iy = -dist_iy;
                }

                if ( dist_i > 0 && dist_i <= (r / 3)) {
                    s_i = 1 / dist_i;
                } else if ( (dist_i > (r / 3)) && (dist_i <= Math.ceil(r))) {
                    s_i = (27 / (4 * r)) * ((dist_i / r) - 1) * ((dist_i / r) - 1);
                } else s_i = 0;

                for (cent_j in selCentroids) {
                    if (cent_j != cent_i) {
                        dist_j = selCentroids[cent_j].properties.d;

                        jx = turf.point([
                            selCentroids[cent_j].geometry.coordinates[0],
                            grid.features[i].geometry.coordinates[1]
                            ]);
                        dist_jx = turf.distance(grid.features[i], jx, 'kilometers');
                        if (selCentroids[cent_j].geometry.coordinates[0] < grid.features[i].geometry.coordinates[0]) {
                            dist_jx = -dist_jx;
                        }

                        jy = turf.point([
                                grid.features[i].geometry.coordinates[0],
                                selCentroids[cent_j].geometry.coordinates[1]
                            ]);
                        dist_jy = turf.distance(grid.features[i], jy, 'kilometers');
                        if (selCentroids[cent_j].geometry.coordinates[1] < grid.features[i].geometry.coordinates[1]) {
                            dist_jy = -dist_jy;
                        }

                        cos = ((dist_ix * dist_jx) + (dist_iy * dist_jy)) / (dist_i * dist_j);


                        if ( dist_j > 0 && dist_j <= (r / 3)) {
                            s_j = 1 / dist_j;
                        } else if ( dist_j > (r / 3) && (dist_j <= r)) {
                            s_j = (27 / (4 * r)) * ((dist_j / r) - 1) * ((dist_j / r) - 1);
                        } else s_j = 0;

                        t_iNum += s_j * (1 - cos);
                        t_iDen += s_j;
                    }
                }

                t_i = t_iNum/t_iDen;
                w = s_i * s_i * (1 + t_i);

                selCentroids[cent_i].properties.w = w;
            }

            for (cent_i in selCentroids) {

                ix = turf.point([
                    selCentroids[cent_i].geometry.coordinates[0],
                    grid.features[i].geometry.coordinates[1]
                    ]);

                iy = turf.point([
                    grid.features[i].geometry.coordinates[0],
                    selCentroids[cent_i].geometry.coordinates[1]
                    ]);

                A_iNum = 0,
                A_iDen = 0,
                B_iNum = 0;

                for (cent_j in selCentroids) {
                    if (cent_j != cent_i) {

                        var w_j = selCentroids[cent_j].properties.w;
                        var z_i = selCentroids[cent_i].properties.z;
                        var z_j = selCentroids[cent_j].properties.z;

                        jx = turf.point([
                            selCentroids[cent_j].geometry.coordinates[0],
                            grid.features[i].geometry.coordinates[1]
                            ]);

                        jy = turf.point([
                                grid.features[i].geometry.coordinates[0],
                                selCentroids[cent_j].geometry.coordinates[1]
                            ]);

                        var jx_ix = turf.distance(jx,ix,'kilometers');
                        var jy_iy = turf.distance(jy,iy,'kilometers');
                        var distBtwCent = turf.distance(selCentroids[cent_j],selCentroids[cent_i],'kilometers');

                        A_iNum += ( w_j * (z_j - z_i) * jx_ix ) / (distBtwCent * distBtwCent);
                        A_iDen += w_j;
                        B_iNum += ( w_j * (z_j - z_i) * jy_iy ) / (distBtwCent * distBtwCent);
                    }
                }

                A_i = A_iNum / A_iDen;
                selCentroids[cent_i].properties.ai = A_i;
                B_i = B_iNum / A_iDen;
                selCentroids[cent_i].properties.bi = B_i;
                A_iB_i = (A_i * A_i) + (B_i * B_i);
                selCentroids[cent_i].properties.aibi = A_iB_i;
            }

            selCentroids.sort(function(a,b) {
                return a.properties.z - b.properties.z;
            });

            var minZ = selCentroids[0].properties.z;
            var maxZ = selCentroids[selCentroids.length - 1].properties.z;

            selCentroids.sort(function(a,b) {
                return a.properties.aibi - b.properties.aibi;
            });

            var maxaibi = selCentroids[selCentroids.length - 1].properties.aibi;

            v = ( 0.1 * (maxZ - minZ) ) / Math.sqrt(maxaibi);

            for (cent_i in selCentroids) {
                ix = turf.point([
                        selCentroids[cent_i].geometry.coordinates[0],
                        grid.features[i].geometry.coordinates[1]
                        ]);

                iy = turf.point([
                        grid.features[i].geometry.coordinates[0],
                        selCentroids[cent_i].geometry.coordinates[1]
                        ]);

                var P = grid.features[i];

                A_i = selCentroids[cent_i].properties.ai;
                B_i = selCentroids[cent_i].properties.bi;

                dist_x = turf.distance(P, ix, 'kilometers');
                dist_y = turf.distance(P, iy, 'kilometers');
                dist = selCentroids[cent_i].properties.d;
                var w_i = selCentroids[cent_i].properties.w;
                z = selCentroids[cent_i].properties.z;

                dz_i = ((A_i * dist_x) + (B_i * dist_y)) * (v / (v + dist));

                idwNum += w_i * (z + dz_i);
                idwDen += w_i;

            }

            idw = idwNum/idwDen;

            if (idwDen != 0) {
                grid.features[i].properties.z = idw;
                valueArray.push(idw);
            } else {
                grid.features[i].properties.z = 0;
                valueArray.push(0);
            }
        }
    } else if (symapMode == 'proximal') {

        mapAttr = 'd.properties.d';

        var centroids = [];
        for(var i = 0; i < counties.length; i++) {
            centroids[i] = turf.point(
                turf.center(counties[i]).geometry.coordinates
            );
        }

        for (i in grid.features) {
            for (j in centroids) {
                var dist = turf.distance(grid.features[i],centroids[j],'kilometers');
                centroids[j].properties.d = dist;
            }

            centroids.sort(function(a,b) {
                return a.properties.d - b.properties.d;
            });

            var d = centroids[0].properties.d;

            grid.features[i].properties.z = d;
            valueArray.push(d);
        }
    }

    var breaks = ss.jenks(valueArray, numClasses);

    var textShade = d3.scale.quantile()
        .domain(breaks)
        .range(textSymbology);

    features.append("g").attr("class","symapFill")
        .selectAll("text")
        .data(grid.features)
        .enter()
        .append("text")
        .attr("x", function(d) {
            return projection([d.geometry.coordinates[0], d.geometry.coordinates[1]])[0];
        })
        .attr("y", function(d) {
            return projection([d.geometry.coordinates[0], d.geometry.coordinates[1]])[1];
        })
        .attr({
            "font-size": fontSize,
            "letter-spacing": -fontSize*0.6
        })
        .text(function(d) {
            return textShade(d.properties.z);
        })
        .attr("d", path);

    features.append("g").attr("class","intBoundary")
        .append("path")
        .datum(topojson.mesh(ky, ky.objects.counties, function(a, b) { return a !== b; }))
        .attr("d", path);

//                features.append("g").attr("class","extBoundary")
//                .append("path")
//                .datum(topojson.mesh(ky, ky.objects.counties, function(a, b) { return a === b; }))
//                .attr("d", path);
});

function zoomed() {
    var e = d3.event;
    var tx = Math.min(0, Math.max(e.translate[0], w - (w * e.scale)));
    var ty = Math.min(0, Math.max(e.translate[1], h - (h * e.scale)));

    zoom.translate([tx, ty]);

    features.attr("transform", "translate(" + [tx, ty] + ")scale(" + e.scale + ")");
}
