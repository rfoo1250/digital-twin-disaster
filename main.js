// File name: main.js
// File description: script for chloropeth map etc
// 

// Variable decl and init

let allData, countiesTopo;
let recourseData = [];          
let sourceNecessity = []; 
let nriData = [];
let selectedFips = null;
let fipsToIdxMap = new Map();

const tooltip = d3.select("#tip");

// returns true if the selector exists on the current page
function has(sel) {
  return document.querySelector(sel) !== null;
}

// ────────────────────────────────────────────────────────────────────────────────
// 1) LOAD data_features.csv + COUNTY TOPOJSON (no year filters anymore)
Promise.all([
  d3.csv("data_features.csv", d3.autoType),
  d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json"),
  d3.csv("models/disaster-assessment-tool/importance_scores_v4b/instance_necessity_scores.csv", d3.autoType),
  d3.csv("nri_county_level.csv", d3.autoType),
  d3.csv("enriched_source_necessity_scores.csv", d3.autoType),
  d3.json("recourse_results.json")

]).then(([dataFeatures, usTopo, instRows, nriRows, srcRows, recJSON]) => {
  // stash
  allData           = dataFeatures;
  countiesTopo      = topojson.feature(usTopo, usTopo.objects.counties).features;
  instanceRows      = instRows;
  nriData           = nriRows;
  sourceNecessity   = srcRows;
  recourseResults   = recJSON;
  const page = window.location.pathname;

  fipsToIdxMap.clear();
    instanceRows.forEach(r => {
      const f = String(r.FIPS).padStart(5, "0");
      fipsToIdxMap.set(f, r.Instance_Index);
    });

  recourseData = instanceRows.map(r => {
    const f = String(r.FIPS).padStart(5, "0");
    // find the JSON entry where original_prediction === counterfactual_prediction
    const origRec = recourseResults.find(rr =>
      rr.instance_idx === r.Instance_Index &&
      rr.original_prediction === rr.counterfactual_prediction
    );
    const sev = origRec != null
      ? ["low","medium","high"][origRec.original_prediction]
      : null;
    return {
      FIPS:             f,
      severity:         sev,
      instance_idx:     r.Instance_Index
    };
  });
  if (page.includes("index.html") || page.endsWith("/")) {
    // Attribution page: allow NRI toggle
  drawAll();
    d3.select("#map-mode").on("change", drawAll);
  } else {
    // Simulation & Recourse pages: always show the data_features choropleth
    drawMap(allData);
  }
})
.catch(err => console.error("Data load error:", err));


// CHOROPLETH: COUNTIES FOR SELECTED YEAR
function drawMap(data) {
  const svg = d3.select("#map"),
        W   = svg.node().clientWidth,
        H   = svg.node().clientHeight;
  svg.selectAll("*").remove();

  // 1) Responsive projection + path generator
const proj = d3.geoAlbersUsa()
.fitSize([W, H], {type: "FeatureCollection", features: countiesTopo});

svg.attr("viewBox", `0 0 ${W} ${H}`);   // keep map crisp when SVG resizes

const pathGen = d3.geoPath().projection(proj);


  // 2) Count how many rows per FIPS (number of events or records per county)
  const counts = d3.rollups(
    data,           // data = allData from data_features.csv
    vs => vs.length,
    d  => String(d.FIPS).padStart(5, '0')  // ensure five‐digit string
  );
  // counts = [ [ "04005", 12 ], [ "06037", 7 ], … ]

  const countMap = new Map(counts); 
  // Map { "04005" → 12, "06037" → 7, … }

  // 3) Let’s pick a single “fill color” for any county that appears at least once.
  //    If you want a heatmap by the raw count, you can replace this step with a colorScale.
  //    For now, we’ll just do: present = blue; absent = #eee.
  const presentColor = "#3182bd";  
  const absentColor  = "#eee";

  // 4) Draw every county path
  svg.selectAll("path")
    .data(countiesTopo)
    .join("path")
      .attr("d", pathGen)
      .attr("fill", d => {
        // d.id is a string or number. We’ll treat it as a zero‐padded string:
        const fips = String(d.id).padStart(5, '0');

        return countMap.has(fips)
          ? presentColor
          : absentColor;
      })
      .attr("stroke", "#999")
      .attr("stroke-width", 1)
      .on("click", (e, d) => {
        const fips = String(d.id).padStart(5, "0");
        selectedFips = fips;

        // FIPS value changed -> event for global
        document.dispatchEvent(new CustomEvent('fipsChanged', { 
          detail: { fips: selectedFips } 
        }));

        // Add this part to update the selected county text
        const row = recourseData.find(r => String(r.FIPS).padStart(5,"0") === fips);
        console.log(row);
        
        // FIXME: county name not exist, bottom line does not work for all counties
        //const countyName = row ? `${row.County_Name || 'Unknown'}, ${row.State || ''}` : `FIPS ${fips}`;
        const countyName = `FIPS ${fips}`;
        d3.select("#selected-county-text").text(`Selected: ${countyName}`);
        
        if (has("#bar"))        drawEnrichedInstanceBar(fips);      // Attribution page only
        if (has("#instance-data")) updateDataDisplay(fips); // Recourse page only
        if (has("#user-input"))    updateUserInput(fips);   // Recourse page only

        // const row = recourseData.find(r=>String(r.FIPS).padStart(5,"0")===fips);
        if (row?.severity) {
                    drawLollipopChart(fips, row.severity);
                  } else {
                    d3.select("#chart").html(`<p>No baseline data for FIPS ${fips}</p>`);
                  }
      })
    
      .on("mouseover", (e, d) => {
        const fips = String(d.id).padStart(5, '0');
        const c = countMap.get(fips) || 0;
        tooltip
          .style("opacity", 0.9)
          .html(`<strong>FIPS ${fips}</strong><br>${c} record${c===1?"":"s"}`)
          .style("left", (e.pageX + 10) + "px")
          .style("top",  (e.pageY - 28) + "px");
        d3.select(e.currentTarget)
          .attr("stroke", "#000")
          .attr("stroke-width", 2);
      })
      .on("mouseout", (e, d) => {
        tooltip.style("opacity", 0);
        d3.select(e.currentTarget)
          .attr("stroke", "#999")
          .attr("stroke-width", 1);
      });

  // 5) Add selected county text in top right
  const selectedText = svg.append("text")
  .attr("id", "selected-county-text")
  .attr("x", W - 20)  // 20px from right edge
  .attr("y", 30)      // 30px from top
  .attr("text-anchor", "end")
  .style("font-size", "16px")
  .style("font-weight", "600")
  .style("fill", "#333")
  .style("background", "rgba(255,255,255,0.8)")
  .text("Select a county!");

  // 6) (Optional) Legend: “Blue = county in data_features.csv; Light gray = not in data”
  // 5) Legend: “Blue = county in data_features.csv; Light gray = not in data”
  const legend = svg.append("g")
  .attr("transform", `translate(${W - 180}, 60)`);

  const legendData = [
    { color: presentColor, label: "Counties of Importance" },
    { color: absentColor,  label: "Other Counties" }
  ];

legend.selectAll("g")
    .data(legendData)
  .join("g")
    .attr("transform", (d,i) => `translate(0, ${i * 24})`)  // 24px between rows
  .each(function(d) {
    const g = d3.select(this);
    g.append("rect")
      .attr("width",  20)
      .attr("height", 20)
      .attr("fill",   d.color)
      .attr("stroke", "#999");
    g.append("text")
      .attr("x",  26)
      .attr("y",  14)
      .style("font-size","12px")
      .text(d.label);
  });

  // 7) Title
  svg.append("text")
    .attr("x", W/2).attr("y", 30)
    .attr("text-anchor","middle")
    .style("font-size","1.2rem")
    .style("font-weight","600")
    .text("All Counties (from data_features.csv)");
}

function extractTopFeatures(row, n) {
  // 1) Collect all keys that start with "necessity_"
  const featureData = [];
  Object.keys(row).forEach(key => {
    if (key.startsWith("necessity_")) {
      // Remove the "necessity_" prefix
      const featName = key.replace("necessity_", "");
      // Convert the raw string to a number
      const val = +row[key];
      featureData.push({ feature: featName, value: val });
    }
  });

  // 2) Sort descending by value
  featureData.sort((a, b) => b.value - a.value);

  // 3) Return the first n items (or fewer if there aren't n)
  return featureData.slice(0, n);
}


function drawFeatureBar(fips) {
  if (!has("#bar")) return;
  const svg = d3.select("#bar"),
        W   = svg.node().clientWidth,
        H   = svg.node().clientHeight;
  svg.selectAll("*").remove(); 
  
  
  // 1) Load the entire CSV of instance-level necessity scores
  d3.csv("models/disaster-assessment-tool/importance_scores_v4b/instance_necessity_scores.csv", d3.autoType)
    .then(rawData => {
      // 2) Find the single row whose "c" column matches the clicked FIPS
      //    Coerce both to strings to avoid type mismatches.
      //const row = rawData.find(d => String(d.FIPS) === String(fips));
      const row = rawData.find(d => (+d.FIPS) === (+fips));
      if (!row) {
        svg.append("text")
          .attr("x",  W / 2)
          .attr("y",  H / 2)
          .attr("text-anchor", "middle")
          .style("fill", "darkred")
          .text(`No necessity‐score data for FIPS ${fips}`);
        return;
      }
      n = 15
      // 3) Extract the top 15 features by necessity value
      const top15 = extractTopFeatures(row, n);
      // Now top15 is an array like:
      //   [ { feature: "transition_1_0", value: 0.87 },
      //     { feature: "News_Injuries",   value: 0.75 },
      //     … up to 15 items … ]

      // 4) If there are no "necessity_" keys at all, showing a message
      if (top15.length === 0) {
        svg.append("text")
          .attr("x",  W / 2)
          .attr("y",  H / 2)
          .attr("text-anchor", "middle")
          .style("fill", "darkred")
          .text(`No "necessity_" features found for FIPS ${fips}`);
        return;
      }

      // 5) Define margins & inner dimensions
      const margin = { top: 40, right: 20, bottom: 60, left: 100 },
            innerW = W - margin.left - margin.right,
            innerH = H - margin.top  - margin.bottom;

      // 6) Build scales based on the top15 data
      const xScale = d3.scaleLinear()
        .domain([0, d3.max(top15, d => d.value) || 1])
        .range([margin.left, margin.left + innerW]);

      const yScale = d3.scaleBand()
        .domain(top15.map(d => d.feature))
        .range([margin.top, margin.top + innerH])
        .padding(0.1);

      // 7) Draw X-axis at the bottom
      svg.append("g")
        .attr("transform", `translate(0, ${margin.top + innerH})`)
        .call(d3.axisBottom(xScale).ticks(5).tickFormat(d3.format(".2f")));

      // 8) Draw Y-axis on the left
      svg.append("g")
        .attr("transform", `translate(${margin.left}, 0)`)
        .call(d3.axisLeft(yScale));

      // 9) Chart title
      svg.append("text")
        .attr("class", "chart-title")
        .attr("x", (W / 2) - 1)
        .attr("y", margin.top / 2)
        .attr("text-anchor", "middle")
        .text(`Top ${n} Necessity Features for FIPS ${fips}`);

      // 10) X-axis label
      svg.append("text")
        .attr("class", "axis-label")
        .attr("x", margin.left + innerW / 2)
        .attr("y", margin.top + innerH + 50)
        .attr("text-anchor", "middle")
        .text("Necessity Value (0–1)");

      // 11) Y-axis label (vertical)
      svg.append("text")
        .attr("class", "axis-label")
        .attr("transform", "rotate(-90)")
        .attr("x", - (margin.top + innerH / 2))
        .attr("y", margin.left - 80)
        .attr("text-anchor", "middle")
        .text("Feature");

      // 12) Draw the 15 bars
      svg.selectAll("rect")
        .data(top15)
        .join("rect")
          .attr("x",      d => margin.left)
          .attr("y",      d => yScale(d.feature))
          .attr("width",  d => xScale(d.value) - margin.left)
          .attr("height", yScale.bandwidth())
          .attr("fill",   "#3182bd")
        .on("mouseover", (e, d) => {
          tooltip
            .style("opacity", 0.9)
            .html(`<strong>${d.feature}</strong><br>Value: ${d3.format(".2f")(d.value)}`)
            .style("left", (e.pageX + 8) + "px")
            .style("top",  (e.pageY - 28) + "px");
          d3.select(e.currentTarget).attr("fill", "#f49e4c");
        })
        .on("mouseout", () => {
          tooltip.style("opacity", 0);
          d3.selectAll("#bar rect").attr("fill", "#3182bd");
        });

    })
    .catch(err => {
      console.error("Could not load necessity_scores CSV:", err);
      svg.append("text")
        .attr("x",  W / 2)
        .attr("y",  H / 2)
        .attr("text-anchor", "middle")
        .style("fill", "darkred")
        .text("Error loading necessity‐score data.");
    });
}

function clearWorldMap() {
  d3.select("#layerControls").html("");
  d3.select("#worldmap").selectAll("*").remove();
}

// ── Populate Feature, Source, Group dropdowns ──────────────────────────
// d3.csv('models/disaster-assessment-tool/assets/groupings/feature_groupings.csv')
//   .then(rows => {
//     if (!rows.length) return;

//     // auto-detect columns  A = Feature, B = Group, C = Source
//     const cols      = Object.keys(rows[0]);
//     const featKey   = cols[0];         // e.g. "feature"
//     const groupKey  = cols[1];         // e.g. "group"
//     const sourceKey = cols[2];         // e.g. "source"

//     /* ---------- 1.  FEATURES  – checkbox per row ------------------- */
//     const featCont = d3.select('#feature-dropdown .dropdown-content');
//     rows.forEach(r => {
//       const val = r[featKey];
//       const id  = `feat-${val.replace(/\W+/g,'_')}`;
//       const lbl = featCont.append('label').attr('for', id);
//       lbl.append('input')
//          .attr('type','checkbox')
//          .attr('id',   id)
//          .attr('value',val);
//       lbl.append('span').text(` ${val}`);
//     });

//     /* ---------- 2.  SOURCES  – checkbox per unique value ----------- */
//     const uniqueSources = Array.from(new Set(rows.map(r => r[sourceKey])));
//     const srcCont = d3.select('#source-dropdown .dropdown-content');
//     uniqueSources.forEach(s => {
//       const id  = `src-${s.replace(/\W+/g,'_')}`;
//       const lbl = srcCont.append('label').attr('for', id);
//       lbl.append('input')
//          .attr('type','checkbox')
//          .attr('id',   id)
//          .attr('value',s);
//       lbl.append('span').text(` ${s}`);
//     });

//     /* ---------- 3.  FEATURE GROUPS  –  single-select list ---------- */
//     const uniqueGroups = Array.from(new Set(rows.map(r => r[groupKey])));
//     const grpCont = d3.select('#group-dropdown .dropdown-content');

//     /** helper: mark selected item */
//     function selectGroup(g){
//       grpCont.selectAll('a').classed('selected', d => d === g);
//       // TODO: call whatever update/filter routine you already have
//       console.log('Selected group:', g);
//     }

//     grpCont.selectAll('a')
//       .data(uniqueGroups)
//       .join('a')
//         .attr('href','#')
//         .text(d => d)
//         .on('click', (e,d) => {          // single-select click
//           e.preventDefault();
//           selectGroup(d);
//         });
//   })
//   .catch(err => console.error('Failed to load grouping CSV:', err));


// 🔁  replace ALL copies of updateDataDisplay() with exactly ONE copy
function updateDataDisplay(fips) {
  if (!has("#instance-data")) return;
  // make sure both sides are numbers OR both are 5-digit strings
  const row = recourseData.find(r => +r.FIPS === +fips);   // <─ coercion

  const box = d3.select("#instance-data");
  box.selectAll("p").remove();

  if (!row) {
    box.append("p").text(`No data for FIPS ${fips}`);
  } else {
    box.append("p").text(`Severity: ${row.severity}`);
  }
}

  
  
function updateUserInput(fips){
  if (!has("#user-input")) return;
  const row       = recourseData.find(r => +r.FIPS === +fips);
  const container = d3.select("#user-input").html("");

  if (!row){
    container.append("p").text(`No editable data for FIPS ${fips}`);
    return;
  }

  container.append("label")
           .attr("for","severity-select")
           .text("Set severity: ");

  /* build the <select>, then attach ONE change-handler to it */
  const sel = container.append("select")
                       .attr("id","severity-select")
                       .on("change", function(){                 // ← MOVE handler here
                         const userSev = this.value;
                         drawLollipopChart(fips, userSev);    // live refresh
                       });

  sel.selectAll("option")                                       // only options below
     .data(["low","medium","high"])
     .join("option")
       .attr("value", d => d)
       .property("selected", d => d === row.severity)
       .text(d => d.charAt(0).toUpperCase() + d.slice(1));
}



function severityTarget(val, lvl) {
  if (lvl === "low")    return +d3.format(".3f")(val * 0.40);          // –-60 %
  if (lvl === "high")   return +d3.format(".3f")(Math.min(val * 1.40, 1));
  return +d3.format(".3f")(val);                                       // medium
}

// 0) Helpers (run once after loading your CSV+JSON)
function severityToIndex(level) {
  switch ((level || "").toLowerCase()) {
    case "low":    return 0;
    case "medium": return 1;
    case "high":   return 2;
    default:       return null;
  }
}

function getInstanceIndexFromFips(fips) {
  const key = String(fips).padStart(5, '0');
  return fipsToIdxMap.get(key) ?? null;
}

function drawLollipopChart(fips, userLvl) {
  if (!has("#chart")) return;

  // 1) look up instance & rec
  const instanceIdx = getInstanceIndexFromFips(fips);
  const lvlIdx      = severityToIndex(userLvl);
  const rec         = recourseResults.find(r =>
                        r.instance_idx === instanceIdx &&
                        r.counterfactual_prediction === lvlIdx
                      );
  if (!rec?.changed_features?.length) {
    return d3.select("#chart")
             .html(`<p>No counterfactual data for FIPS ${fips} at "${userLvl}"</p>`);
  }

  // 2) prepare data + SVG
  const top5 = rec.changed_features;  // rename to match snippet
  const box  = d3.select("#chart").html("");
  const W    = box.node().clientWidth  || 420;
  const H    = Math.max(box.node().clientHeight, 240);
  const m    = { t:40, r:Math.max(30, W*0.06), b:40, l:Math.max(110, W*0.25) };
  const svg  = box.append("svg")
                  .attr("viewBox", `0 0 ${W} ${H}`)
                  .attr("width", "100%")
                  .attr("height","100%");

  // 3) scales & axes (with a little padding)
  const rawMax = d3.max(top5, d => Math.max(d.original, d.cf));
  const x = d3.scaleLinear()
              .domain([0, rawMax * 1.1])
              .nice()
              .range([m.l, W - m.r]);
  const y = d3.scaleBand()
              .domain(top5.map(d => d.feature))
              .range([m.t - 10, H - m.b + 10])
              .padding(0.5);

  svg.append("g")
     .attr("transform", `translate(0,${H - m.b})`)
     .call(d3.axisBottom(x).ticks(6));

  svg.append("g")
     .attr("transform", `translate(${m.l},0)`)
     .call(d3.axisLeft(y));

  // 5) ARROW MARKER
  svg.append("defs").append("marker")
     .attr("id", "arrowHead")
     .attr("viewBox", "0 0 10 10")
     .attr("refX", 10).attr("refY", 5)
     .attr("markerUnits", "userSpaceOnUse")
     .attr("markerWidth", 10)
     .attr("markerHeight",10)
     .attr("orient", "auto-start-reverse")
   .append("path")
     .attr("d","M0,0L10,5L0,10Z")
     .attr("fill","#000");

  // 6) CONNECTORS
  svg.append("g").selectAll("line")
     .data(top5)
     .join("line")
       .attr("x1", d => x(d.original))
       .attr("x2", d => x(d.cf))
       .attr("y1", d => y(d.feature) + y.bandwidth()/2)
       .attr("y2", d => y(d.feature) + y.bandwidth()/2)
       .attr("stroke","#888")
       .attr("stroke-width",1.5)
       .attr("marker-end","url(#arrowHead)")
       .attr("pointer-events","none");

  // 7) DOTS + TOOLTIP
  const fmt = d3.format(".3f");
  const tip = (lbl,val) => `<strong>${lbl}</strong><br>${fmt(val)}`;

  // current = black
  svg.append("g").selectAll(".model")
     .data(top5)
     .join("circle")
       .attr("class","model")
       .attr("cx", d => x(d.original))
       .attr("cy", d => y(d.feature) + y.bandwidth()/2)
       .attr("r",6)
       .attr("fill","#000")
       .on("mouseover", (e,d) => tooltip
         .style("opacity",0.9)
         .html(tip(`${d.feature} (current)`, d.original))
         .style("left", `${e.pageX+8}px`)
         .style("top",  `${e.pageY-28}px`))
       .on("mouseout", () => tooltip.style("opacity",0));

  // user input = red
  svg.append("g").selectAll(".target")
     .data(top5.filter(d => d.cf !== d.original))
     .join("circle")
       .attr("class","target")
       .attr("cx", d => x(d.cf))
       .attr("cy", d => y(d.feature) + y.bandwidth()/2)
       .attr("r",6)
       .attr("fill","#e41a1c")
       .on("mouseover", (e,d) => tooltip
         .style("opacity",0.9)
         .html(tip(`${d.feature} (user input)`, d.cf))
         .style("left", `${e.pageX+8}px`)
         .style("top",  `${e.pageY-28}px`))
       .on("mouseout", () => tooltip.style("opacity",0));

  // 8) TITLE
  svg.append("text")
     .attr("x", W/2).attr("y", m.t - 18)
     .attr("text-anchor","middle")
     .attr("font-size","1.05rem")
     .attr("font-weight",600)
     .text(`Algorithmic Recourse for FIPS ${fips}`);

  // 9) LEGEND
  const legendData = [
    { lbl:"Current value", color:"#000"    },
    { lbl:"User target",   color:"#e41a1c" }
  ];
  const legend = svg.append("g")
                    .attr("transform", `translate(${W - m.r - 150},${m.t})`)
                    .attr("font-size", ".85rem");

  const row = legend.selectAll("g")
                    .data(legendData)
                    .join("g")
                    .attr("transform",(d,i) => `translate(0,${i*16})`);

  row.append("rect")
     .attr("width",12).attr("height",12)
     .attr("fill", d => d.color);

  row.append("text")
     .attr("x",18).attr("y",10)
     .text(d => d.lbl);
}

/* ───────── Source-wise bar chart ───────────────────────── */
/* ─── Source-wise 3-bar chart ───────────────────────────────────────── */
function drawSourceBar(fips){
  if(!has("#bar")) return;

  const row = sourceNecessity.find(r => String(r.FIPS).padStart(5,'0') === fips);
  if(!row){
    d3.select("#bar").html("<p style='padding:1rem'>No source-level data for this county</p>");
    return;
  }

  /* 1. DATA --------------------------------------------------------- */
  const data = [
    {src:"News",           val:+row.necessity_News},
    {src:"Reddit",         val:+row.necessity_Reddit},
    {src:"Remote Sensing", val:+row.necessity_Transition}
  ];
  const color = d3.scaleOrdinal()
        .domain(data.map(d=>d.src))
        .range(["#d4a73d","#d1793d","#c94d5f"]);   // gold, clay, rose

  /* 2. SIZE — use container’s actual size -------------------------- */
  const box = d3.select("#bar").html("");          // clear previous
  const W = box.node().clientWidth,
        H = box.node().clientHeight;
  const m = {t:40,r:20,b:50,l:60};

  const svg = box.append("svg")
                 .attr("viewBox",`0 0 ${W} ${H}`)
                 .attr("width","100%").attr("height","100%");

  /* 3. SCALES + AXES ----------------------------------------------- */
  const x = d3.scaleBand()
              .domain(data.map(d=>d.src))
              .range([m.l, W-m.r]).padding(0.3);
  const y = d3.scaleLinear()
              .domain([0, d3.max(data,d=>d.val)||1]).nice()
              .range([H-m.b, m.t]);

  svg.append("g")
     .attr("transform",`translate(0,${H-m.b})`)
     .call(d3.axisBottom(x).tickSizeOuter(0));
  svg.append("g")
     .attr("transform",`translate(${m.l},0)`)
     .call(d3.axisLeft(y));
  svg.append("g")                                 // X-axis
     .attr("transform",`translate(0,${H-m.b})`)
     .call(d3.axisBottom(x).tickSizeOuter(0));
  
  svg.append("g")                                 // Y-axis
     .attr("transform",`translate(${m.l},0)`)
     .call(d3.axisLeft(y));
  
  /* NEW → Y-axis label */
  svg.append("text")
     .attr("transform","rotate(-90)")
     .attr("x", -(H/2))
     .attr("y", m.l - 45)
     .attr("text-anchor","middle")
     .attr("font-size",".85rem")
     .attr("font-weight",600)
     .text("Necessity Score");
  

  /* 4. BARS + tooltip ---------------------------------------------- */
  svg.selectAll("rect")
     .data(data)
     .join("rect")
       .attr("x", d=>x(d.src))
       .attr("y", d=>y(d.val))
       .attr("width", x.bandwidth())
       .attr("height", d=>y(0)-y(d.val))
       .attr("fill", d=>color(d.src))
       .on("mouseover",(e,d)=>{
          tooltip.style("opacity",0.9)
                 .html(`${d.src}: ${d3.format(".3f")(d.val)}`)
                 .style("left",(e.pageX+8)+"px")
                 .style("top",(e.pageY-28)+"px");
       })
       .on("mouseout",()=>tooltip.style("opacity",0));

  /* 5. TITLE -------------------------------------------------------- */
  svg.append("text")
     .attr("x",W/2).attr("y",m.t-15)
     .attr("text-anchor","middle")
     .attr("font-size","1.05rem")
     .attr("font-weight",600)
     .text(`Source-wise Necessity Importance for FIPS ${fips}, ${row.County_Name}, ${row.State}`)


  /* 6. LEGEND (colored dots) --------------------------------------- */
  const leg = svg.append("g")
                 .attr("transform",`translate(${W-m.r-120},${m.t})`);
  leg.selectAll("rect")
     .data(data)
     .join("rect")
       .attr("x",0).attr("y",(d,i)=>i*18)
       .attr("width",14).attr("height",14)
       .attr("fill",d=>color(d.src));
  leg.selectAll("text")
     .data(data)
     .join("text")
       .attr("x",20).attr("y",(d,i)=>i*18+11)
       .attr("font-size",".8rem")
       .text(d=>d.src);
}

// helper to capitalize words
function titleCase(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

// rebuild the legend based on current mode
function updateLegend(mode) {
  const lg = d3.select("#legend").html("");

  if (mode === "nri") {
    // Must match your RISK_RATNG order
    const ratings = [
      "very low","relatively low","relatively moderate",
      "moderate","relatively high","very high"
    ];
    // yellow → red ramp
    const colors = [
      "#ffffcc","#ffeda0","#feb24c",
      "#fd8d3c","#f03b20","#bd0026"
    ];

    ratings.forEach((r,i) => {
      const item = lg.append("div").attr("class","legend-item");
      item.append("div")
          .attr("class","legend-swatch")
          .style("background", colors[i]);
      item.append("span").text(titleCase(r));
    });

  } else {
    // Data Features mode
    const items = [
      { label: "County in data_features.csv", color: "#3182bd" },
      { label: "Other county",               color: "#eee"    }
    ];
    items.forEach(d => {
      const item = lg.append("div").attr("class","legend-item");
      item.append("div")
          .attr("class","legend-swatch")
          .style("background", d.color);
      item.append("span").text(d.label);
    });
  }
}

function drawEnrichedInstanceBar(fips) {
  if (!has("#bar")) return;
  const svg = d3.select("#bar").html(""),
        W   = svg.node().clientWidth,
        H   = svg.node().clientHeight;
  const margin = { top: 40, right: 20, bottom: 60, left: 180 },
        innerW = W - margin.left - margin.right,
        innerH = H - margin.top - margin.bottom;

  d3.csv("enriched_instance_necessity_scores.csv", d3.autoType)
    .then(rows => {
      // find row by FIPS (column CU)
      const row = rows.find(r => String(r.FIPS).padStart(5, "0") === fips);
      if (!row) {
        svg.append("text")
          .attr("x", W/2).attr("y", H/2)
          .attr("text-anchor","middle")
          .style("fill","darkred")
          .text(`No data for FIPS ${fips}`);
        return;
      }
      // grab all columns except FIPS
      const allKeys   = Object.keys(row);
      const fipsIndex = allKeys.indexOf("FIPS");
      const featKeys  = allKeys.slice(1, fipsIndex);            // columns B…CT
      const feats     = featKeys
        .map(k => ({ feature: k, value: +row[k] }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 15);

      // scales
      const x = d3.scaleLinear()
        .domain([0, d3.max(feats, d => d.value) || 1])
        .range([margin.left, margin.left + innerW]);
      const y = d3.scaleBand()
        .domain(feats.map(d => d.feature))
        .range([margin.top, margin.top + innerH])
        .padding(0.1);

      // axes
      svg.append("g")
        .attr("transform", `translate(0,${margin.top+innerH})`)
        .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(".2f")));
      svg.append("g")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y));

      // title & labels
      svg.append("text")
        .attr("x", W/2).attr("y", margin.top/2)
        .attr("text-anchor","middle").style("font-weight",600)
        .text(`Top 15 Features for FIPS ${fips}`);
      svg.append("text")
        .attr("class","axis-label")
        .attr("x", margin.left + innerW/2)
        .attr("y", margin.top + innerH + 50)
        .attr("text-anchor","middle")
        .text("Value");
      svg.append("text")
        .attr("class","axis-label")
        .attr("transform","rotate(-90)")
        .attr("x", -(margin.top + innerH/2))
        .attr("y", margin.left - 150)
        .attr("text-anchor","middle")
        .text("Feature");

      // bars
      svg.selectAll("rect")
        .data(feats)
        .join("rect")
          .attr("x", margin.left)
          .attr("y", d => y(d.feature))
          .attr("width", d => x(d.value) - margin.left)
          .attr("height", y.bandwidth())
          .attr("fill", "#3182bd");
    })
    .catch(err => {
      console.error(err);
      svg.append("text")
        .attr("x", W/2).attr("y", H/2)
        .attr("text-anchor","middle")
        .style("fill","darkred")
        .text("Error loading enriched instance data");
    });
}

function drawEnrichedGroupBar(fips) {
  if (!has("#bar")) return;
  const svg = d3.select("#bar").html(""),
        W   = svg.node().clientWidth,
        H   = svg.node().clientHeight;
  const margin = { top: 40, right: 20, bottom: 60, left: 210 },
        innerW = W - margin.left - margin.right,
        innerH = H - margin.top - margin.bottom;

  d3.csv("enriched_group_necessity_scores.csv", d3.autoType)
    .then(rows => {
      const row = rows.find(r => String(r.FIPS).padStart(5, "0") === fips);
      if (!row) {
        svg.append("text")
          .attr("x", W/2).attr("y", H/2)
          .attr("text-anchor","middle")
          .style("fill","darkred")
          .text(`No data for FIPS ${fips}`);
        return;
      }
      // grab columns B–G (all except FIPS)
      const allKeys   = Object.keys(row);
  const fipsIndex = allKeys.indexOf("FIPS");
  const groupKeys = allKeys.slice(1, fipsIndex);            // columns B…G
  const groups    = groupKeys.map(k => ({ feature: k, value: +row[k] }));

      const x = d3.scaleLinear()
        .domain([0, d3.max(groups, d => d.value) || 1])
        .range([margin.left, margin.left + innerW]);
      const y = d3.scaleBand()
        .domain(groups.map(d => d.feature))
        .range([margin.top, margin.top + innerH])
        .padding(0.2);

      svg.append("g")
        .attr("transform", `translate(0,${margin.top+innerH})`)
        .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(".2f")));
      svg.append("g")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y));

      svg.append("text")
        .attr("x", W/2).attr("y", margin.top/2)
        .attr("text-anchor","middle").style("font-weight",600)
        .text(`Feature-Group Scores for FIPS ${fips}`);
      svg.append("text")
        .attr("class","axis-label")
        .attr("x", margin.left + innerW/2)
        .attr("y", margin.top + innerH + 50)
        .attr("text-anchor","middle")
        .text("Value");

      svg.selectAll("rect")
        .data(groups)
        .join("rect")
          .attr("x", margin.left)
          .attr("y", d => y(d.feature))
          .attr("width", d => x(d.value) - margin.left)
          .attr("height", y.bandwidth())
          .attr("fill", "#3182bd");
    })
    .catch(err => {
      console.error(err);
      svg.append("text")
        .attr("x", W/2).attr("y", H/2)
        .attr("text-anchor","middle")
        .style("fill","darkred")
        .text("Error loading enriched group data");
    });
}
function drawEnrichedSourceBar(fips) {
  if (!has("#bar")) return;
  const svg = d3.select("#bar").html(""),
        W   = svg.node().clientWidth,
        H   = svg.node().clientHeight;
  const margin = { top: 40, right: 20, bottom: 60, left: 130 },
        innerW = W - margin.left - margin.right,
        innerH = H - margin.top  - margin.bottom;

  d3.csv("enriched_source_necessity_scores.csv", d3.autoType)
    .then(rows => {
      // find the row for this county
      const row = rows.find(r => String(r.FIPS).padStart(5, "0") === fips);
      if (!row) {
        svg.append("text")
           .attr("x", W/2).attr("y", H/2)
           .attr("text-anchor","middle")
           .style("fill","darkred")
           .text(`No source data for FIPS ${fips}`);
        return;
      }

      // slice columns B…(just before "FIPS")
      const allKeys   = Object.keys(row);
      const fipsIndex = allKeys.indexOf("FIPS");
      const srcKeys   = allKeys.slice(1, fipsIndex);    // B… before FIPS

      const sources = srcKeys.map(k => ({
        label: k,
        value: +row[k]
      }));

      // scales
      const x = d3.scaleLinear()
        .domain([0, d3.max(sources, d => d.value) || 1])
        .range([margin.left, margin.left + innerW]);
      const y = d3.scaleBand()
        .domain(sources.map(d => d.label))
        .range([margin.top, margin.top + innerH])
        .padding(0.2);

      // axes
      svg.append("g")
         .attr("transform", `translate(0,${margin.top + innerH})`)
         .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(".2f")));
      svg.append("g")
         .attr("transform", `translate(${margin.left},0)`)
         .call(d3.axisLeft(y));

      // title & axis labels
      svg.append("text")
         .attr("x", W/2).attr("y", margin.top/2)
         .attr("text-anchor","middle").style("font-weight",600)
         .text(`Source Necessity for FIPS ${fips}`);
      svg.append("text")
         .attr("class","axis-label")
         .attr("x", margin.left + innerW/2)
         .attr("y", margin.top + innerH + 50)
         .attr("text-anchor","middle")
         .text("Score");
      
      // draw bars
      svg.selectAll("rect")
         .data(sources)
         .join("rect")
           .attr("x", margin.left)
           .attr("y", d => y(d.label))
           .attr("width", d => x(d.value) - margin.left)
           .attr("height", y.bandwidth())
           .attr("fill", "#3182bd")
         .on("mouseover", (e, d) => {
           tooltip.style("opacity", 0.9)
                  .html(`<strong>${d.label}</strong><br>${d3.format(".2f")(d.value)}`)
                  .style("left", (e.pageX + 8) + "px")
                  .style("top",  (e.pageY - 28) + "px");
         })
         .on("mouseout", () => tooltip.style("opacity", 0));
    })
    .catch(err => {
      console.error(err);
      svg.append("text")
         .attr("x", W/2).attr("y", H/2)
         .attr("text-anchor","middle")
         .style("fill","darkred")
         .text("Error loading source data");
    });
}

// Wire up the Sources button:
d3.select("#source-btn").on("click", () => {
  if (selectedFips) drawEnrichedSourceBar(selectedFips);
  else alert("Please click a county first");
});





// wire them up & default on map-click:
d3.select("#feature-btn").on("click", () => {
  if (selectedFips) drawEnrichedInstanceBar(selectedFips);
  else alert("Please click a county first");
});
d3.select("#group-btn").on("click", () => {
  if (selectedFips) drawEnrichedGroupBar(selectedFips);
  else alert("Please click a county first");
});

// then, in your drawMap’s click handler, replace:
    if (has("#bar"))           drawFeatureBar(fips);
// with:
    if (has("#bar"))           drawEnrichedInstanceBar(fips);

function drawMapNRI() {
  const svg = d3.select("#map"),
        W   = svg.node().clientWidth,
        H   = svg.node().clientHeight;
  svg.selectAll("*").remove();

  const proj    = d3.geoAlbersUsa()
                    .fitSize([W,H], {type:"FeatureCollection",features:countiesTopo});
  const pathGen = d3.geoPath().projection(proj);
  svg.attr("viewBox", `0 0 ${W} ${H}`);

  // Build a map: FIPS → risk_rating
  const nriMap = new Map(nriData.map(r => {
    const f = String(r.STCOFIPS).padStart(5,"0");
    return [f, String(r.RISK_RATNG).toLowerCase()];
  }));

  const ratings = [
    "very low","relatively low","relatively moderate",
    "moderate","relatively high","very high"
  ];
  
  // define a matching array of hexes
  const colors = [
    "#ffffcc","#ffeda0","#feb24c",
    "#fd8d3c","#f03b20","#bd0026"
  ];
  
  const colorRamp = d3.scaleOrdinal()
    .domain(ratings)
    .range(colors);

  // place the legend in bottom-left, just like drawMap()
  const legend = svg.append("g")
  .attr("transform", `translate(${W - 150}, 60)`);
ratings.forEach((r, i) => {
  legend.append("rect")
    .attr("x",   0)
    .attr("y",   i * 20)
    .attr("width",  20)
    .attr("height", 20)
    .attr("fill",   colors[i])   // now defined!
    .attr("stroke", "#999");

  legend.append("text")
    .attr("x",  26)
    .attr("y",  i * 20 + 14)
    .style("font-size", "12px")
    .text(r.charAt(0).toUpperCase() + r.slice(1));
});


  svg.append("text")
   .attr("x", W/2).attr("y", 28)
   .attr("text-anchor","middle")
   .style("font-size","1.2rem")
   .style("font-weight","600")
   .text("National Risk Index at a county level");


  svg.selectAll("path")
    .data(countiesTopo)
    .join("path")
      .attr("d", pathGen)
      .attr("fill", d => {
        const fips  = String(d.id).padStart(5,"0"),
              rating = nriMap.get(fips);
        return rating ? colorRamp(rating) : "#eee";
      })
      .attr("stroke","#999")
      .attr("stroke-width",1)
    .on("mouseover",(e,d)=>{
      const f = String(d.id).padStart(5,"0"),
            r = nriMap.get(f) || "none";
      d3.select("#tip")
        .style("opacity",0.9)
        .html(`<strong>FIPS ${f}</strong><br>Risk: ${r}`)
        .style("left",(e.pageX+8)+"px")
        .style("top",(e.pageY-28)+"px");
    })
    .on("mouseout",()=>d3.select("#tip").style("opacity",0))
  ;
}


d3.select("#source-btn").on("click", () => {
  if (selectedFips) {
    drawSourceBar(selectedFips);
  } else {
    alert("Click a county on the map first.");
  }
});

// ------------- clear on year/change --------------
function drawAll() {
  const mode = d3.select("#map-mode").property("value");

  if (mode === "nri")  drawMapNRI();
  else                  drawMap(allData);

  // rebuild the legend
  updateLegend(mode);

  // clear any side‐chart
  d3.select("#bar").selectAll("*").remove();
}


// your existing boot call:
drawAll();

// 2) Then delegate change events to the document so that
//    no matter when or how the checkbox is inserted, we catch it.
document.addEventListener("change", e => {
  if (e.target && e.target.id === "checkbox-nri") {
    drawAll();
  }
});

// 3) And keep your resize handler
window.addEventListener("resize", drawAll);

// Global declarations and initializations
window.selectedFips = selectedFips;
