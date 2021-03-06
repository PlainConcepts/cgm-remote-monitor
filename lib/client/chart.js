'use strict';

var _ = require('lodash');
var times = require('../times');

var DEBOUNCE_MS = 10
  , padding = { bottom: 30 }
  ;

function init (client, d3, $) {
  var chart = { };

  var utils = client.utils;
  var renderer = client.renderer;

  function brushStarted ( ) {
    // update the opacity of the context data points to brush extent
    chart.context.selectAll('circle')
      .data(client.data)
      .style('opacity', 1);
  }

  function brushEnded ( ) {
    // update the opacity of the context data points to brush extent
    chart.context.selectAll('circle')
      .data(client.data)
      .style('opacity', function (d) { return renderer.highlightBrushPoints(d) });
  }

  var extent = client.dataExtent();

  // define the parts of the axis that aren't dependent on width or height
  var xScale = chart.xScale = d3.time.scale().domain(extent);

  var yScale = chart.yScale = d3.scale.log()
    .domain([utils.scaleMgdl(30), utils.scaleMgdl(510)]);

  var xScale2 = chart.xScale2 = d3.time.scale().domain(extent);

  var yScale2 = chart.yScale2 = d3.scale.log()
    .domain([utils.scaleMgdl(36), utils.scaleMgdl(420)]);

  var tickFormat = d3.time.format.multi(  [
    ['.%L', function(d) { return d.getMilliseconds(); }],
    [':%S', function(d) { return d.getSeconds(); }],
    ['%I:%M', function(d) { return d.getMinutes(); }],
    [client.settings.timeFormat === 24 ? '%H:%M' : '%-I %p', function(d) { return d.getHours(); }],
    ['%a %d', function(d) { return d.getDay() && d.getDate() !== 1; }],
    ['%b %d', function(d) { return d.getDate() !== 1; }],
    ['%B', function(d) { return d.getMonth(); }],
    ['%Y', function() { return true; }]
  ]);

  // Tick Values
  var tickValues;
  if (client.settings.units === 'mmol') {
    tickValues = [
      2.0
      , Math.round(utils.scaleMgdl(client.settings.thresholds.bgLow))
      , Math.round(utils.scaleMgdl(client.settings.thresholds.bgTargetBottom))
      , 6.0
      , Math.round(utils.scaleMgdl(client.settings.thresholds.bgTargetTop))
      , Math.round(utils.scaleMgdl(client.settings.thresholds.bgHigh))
      , 22.0
    ];
  } else {
    tickValues = [
      40
      , client.settings.thresholds.bgLow
      , client.settings.thresholds.bgTargetBottom
      , 120
      , client.settings.thresholds.bgTargetTop
      , client.settings.thresholds.bgHigh
      , 400
    ];
  }


  chart.xAxis = d3.svg.axis()
    .scale(xScale)
    .tickFormat(tickFormat)
    .ticks(4)
    .orient('bottom');

  chart.yAxis = d3.svg.axis()
    .scale(yScale)
    .tickFormat(d3.format('d'))
    .tickValues(tickValues)
    .orient('left');

  chart.xAxis2 = d3.svg.axis()
    .scale(xScale2)
    .tickFormat(tickFormat)
    .ticks(6)
    .orient('bottom');

  chart.yAxis2 = d3.svg.axis()
    .scale(yScale2)
    .tickFormat(d3.format('d'))
    .tickValues(tickValues)
    .orient('right');

  chart.yAxis3 = d3.svg.axis()
    .scale(yScale)
    .tickFormat(d3.format('d'))
    .tickValues(tickValues)
    .orient('right');

  // setup a brush
  chart.brush = d3.svg.brush()
    .x(xScale2)
    .on('brushstart', brushStarted)
    .on('brush', client.brushed)
    .on('brushend', brushEnded);

  chart.futureOpacity = d3.scale.linear( )
    .domain([times.mins(25).msecs, times.mins(60).msecs])
    .range([0.8, 0.1]);

  // create svg and g to contain the chart contents
  chart.charts = d3.select('#chartContainer').append('svg')
    .append('g')
    .attr('class', 'chartContainer');

  chart.focus = chart.charts.append('g');

  // create the x axis container
  chart.focus.append('g')
    .attr('class', 'x axis');

  // create the y axis container
  chart.focus.append('g')
    .attr('class', 'y axis');

  // create the second y axis container
  chart.focus.append('g')
    .attr('class', 'y3 axis');

  chart.context = chart.charts.append('g');

  // create the x axis container
  chart.context.append('g')
    .attr('class', 'x axis');

  // create the y axis container
  chart.context.append('g')
    .attr('class', 'y axis');

  function createAdjustedRange() {
    var range = chart.brush.extent().slice();

    var end = range[1].getTime() + client.forecastTime;
    if (!chart.inRetroMode()) {
      var lastSGVMills = client.latestSGV ? client.latestSGV.mills : client.now;
      end += (client.now - lastSGVMills);
    }
    range[1] = new Date(end);

    return range;
  }

  chart.inRetroMode = function inRetroMode() {
    if (!chart.brush || !chart.xScale2) {
      return false;
    }

    var brushTime = chart.brush.extent()[1].getTime();
    var maxTime = chart.xScale2.domain()[1].getTime();

    return brushTime < maxTime;
  };

  // called for initial update and updates for resize
  chart.update = _.debounce(function debouncedUpdateChart(init) {

    if (client.documentHidden && !init) {
      console.info('Document Hidden, not updating - ' + (new Date()));
      return;
    }

    var chartContainer = $('#chartContainer');

    if (chartContainer.length < 1) {
      console.warn('Unable to find element for #chartContainer');
      return;
    }

    // get current data range
    var dataRange = client.dataExtent();
    var chartContainerRect = chartContainer[0].getBoundingClientRect();
    var chartWidth = Settings.page.width() - 70;
    var chartHeight = chartContainerRect.height - padding.bottom - 60;
    Settings.canvas.width = chartWidth;
    Settings.canvas.height = chartHeight;

    // get the height of each chart based on its container size ratio
    var focusHeight = chart.focusHeight = chartHeight * .7;
    var contextHeight = chart.contextHeight = chartHeight * .2;

    // get current brush extent
    var currentBrushExtent = createAdjustedRange();

    // only redraw chart if chart size has changed
    if ((chart.prevChartWidth !== chartWidth) || (chart.prevChartHeight !== chartHeight)) {

      chart.prevChartWidth = chartWidth;
      chart.prevChartHeight = chartHeight;

      //set the width and height of the SVG element
      chart.charts.attr('width', chartWidth)
        .attr('height', chartHeight + padding.bottom);

      // ranges are based on the width and height available so reset
      chart.xScale.range([0, chartWidth]);
      chart.xScale2.range([0, chartWidth]);
      chart.yScale.range([focusHeight, 0]);
      chart.yScale2.range([chartHeight, chartHeight - contextHeight]);

      // General
      var line_dashing = ('1, 3');
      var line_stroke = '#9e9ea5';
      window.line_start_x = Settings.topChart.left;
      var line_end_x = Settings.topChart.width()+Settings.topChart.left;

      // HIGH LINE
      var highline_start_x = line_start_x;
      var highline_start_y = chart.yScale(utils.scaleMgdl(client.settings.thresholds.bgHigh));
      var highline_end_x = line_end_x;
      var highline_end_y = highline_start_y;

      // TARGET TOP LINE
      var targettopline_start_x = line_start_x;
      var targettopline_start_y = chart.yScale(utils.scaleMgdl(client.settings.thresholds.bgTargetTop));
      var targettopline_end_x = line_end_x;
      var targettopline_end_y = targettopline_start_y;

      // TARGET BOTTOM LINE
      var targetbottomline_start_x = line_start_x;
      var targetbottomline_start_y = chart.yScale(utils.scaleMgdl(client.settings.thresholds.bgTargetBottom));
      var targetbottomline_end_x = line_end_x;
      var targetbottomline_end_y = targetbottomline_start_y;

      // LOW LINE
      var lowline_start_x = line_start_x;
      var lowline_start_y = chart.yScale(utils.scaleMgdl(client.settings.thresholds.bgLow));
      var lowline_end_x = line_end_x;
      var lowline_end_y = lowline_start_y;

      // TOP HIGH LINE
      var tophighline_start_x = line_start_x;
      var tophighline_start_y = chart.yScale(utils.scaleMgdl(400));
      var tophighline_end_x = line_end_x;
      var tophighline_end_y = tophighline_start_y;

      // BOTTOM LOW LINE
      var bottomlowline_start_x = line_start_x;
      var bottomlowline_start_y = chart.yScale(utils.scaleMgdl(40));
      var bottomlowline_end_x = line_end_x;
      var bottomlowline_end_y = bottomlowline_start_y;

      // MIDDLE LINE
      var middleline_start_x = line_start_x;
      var middleline_start_y = chart.yScale(utils.scaleMgdl(120));
      var middleline_end_x = line_end_x;
      var middleline_end_y = middleline_start_y;

      // BACKGROUND
      var background_x = line_start_x;
      var background_y = tophighline_start_y;
      var background_width = Settings.topChart.width();
      var background_height = bottomlowline_start_y - tophighline_start_y;
      var background_color = 'white';

      // NOW LINE
      var nowline_start_x = chart.xScale(new Date(client.now));
      var nowline_start_y = tophighline_start_y;
      var nowline_end_x = nowline_start_x;
      var nowline_end_y = bottomlowline_start_y;
      var nowline_stroke = '#00d7cc';

      // BLUE OVERLAY
      var blueoverlay_x = line_start_x;
      var blueoverlay_y = targettopline_start_y;
      var blueoverlay_width = (nowline_start_x - line_start_x);
      var blueoverlay_height = (targetbottomline_start_y - targettopline_start_y);
      var blueoverlay_color = "rgba(0, 215, 204, 0.1)";

      // GREY OVERLAY
      var greyoverlay_x = nowline_start_x;
      var greyoverlay_y = nowline_start_y;
      var greyoverlay_width = greyoverlay_x-(Settings.topChart.width()-Settings.topChart.right-Settings.topChart.left);
      var greyoverlay_height = (bottomlowline_start_y - tophighline_start_y);
      var greyoverlay_color = "rgba(0, 0, 0, 0.1)";

      // DARK GREY OVERLAY
      var darkgreyoverlay_x = nowline_start_x;
      var darkgreyoverlay_y = targettopline_start_y;
      var darkgreyoverlay_width = greyoverlay_width;
      var darkgreyoverlay_height = (targetbottomline_start_y - targettopline_start_y);
      var darkgreyoverlay_color = "rgba(149, 149, 149, 0.1)";

      if (init) {

        // if first run then just display axis with no transition
        chart.focus.select('.x')
          .attr('transform', 'translate(0,' + focusHeight + ')')
          .call(chart.xAxis);

        chart.focus.select('.y')
          .attr('transform', 'translate('+Settings.topChart.left+',0)')
          .call(chart.yAxis);

        chart.focus.select('.y3')
          .attr('transform', 'translate('+(Settings.topChart.width()+Settings.topChart.right)+',0)')
          .call(chart.yAxis3);

        // if first run then just display axis with no transition
        chart.context.select('.x')
          .attr('transform', 'translate(0,' + chartHeight + ')')
          .call(chart.xAxis2);

        chart.context.append('g')
          .attr('class', 'x brush')
          .call(d3.svg.brush().x(chart.xScale2).on('brush', client.brushed))
          .selectAll('rect')
          .attr('y', focusHeight)
          .attr('height', chartHeight - focusHeight);

        // disable resizing of brush
        d3.select('.x.brush').select('.background').style('cursor', 'move');
        d3.select('.x.brush').select('.resize.e').style('cursor', 'move');
        d3.select('.x.brush').select('.resize.w').style('cursor', 'move');

        // create a clipPath for when brushing
        chart.clip = chart.charts.append('defs')
          .append('clipPath')
          .attr('id', 'clip')
          .append('rect')
          .attr('x', Settings.topChart.left)
          .attr('height', chartHeight)
          .attr('width', Settings.topChart.width());

        // add a background
        chart.focus.append('rect')
          .attr('class', 'white-background')
          .attr('x', background_x)
          .attr('y', background_y)
          .attr('width', background_width)
          .attr('height', background_height)
          .attr('fill', background_color)
          .attr('clip-path', 'url(#clip)');

        // add a blue overlay
        chart.focus.append('rect')
          .attr('class', 'blue-overlay')
          .attr('x', blueoverlay_x)
          .attr('y', blueoverlay_y)
          .attr('width', blueoverlay_width)
          .attr('height', blueoverlay_height)
          .attr('fill', blueoverlay_color)
          .attr('clip-path', 'url(#clip)');

        // add a grey overlay
        chart.focus.append('rect')
          .attr('class', 'grey-overlay')
          .attr('x', greyoverlay_x)
          .attr('y', greyoverlay_y)
          .attr('width', greyoverlay_width)
          .attr('height', greyoverlay_height)
          .attr('fill', greyoverlay_color)
          .attr('clip-path', 'url(#clip)');

        // add a dark grey overlay
        chart.focus.append('rect')
          .attr('class', 'darkgrey-overlay')
          .attr('x', darkgreyoverlay_x)
          .attr('y', darkgreyoverlay_y)
          .attr('width', darkgreyoverlay_width)
          .attr('height', darkgreyoverlay_height)
          .attr('fill', darkgreyoverlay_color)
          .attr('clip-path', 'url(#clip)');

        // add a line that marks the current time
        chart.focus.append('line')
          .attr('class', 'now-line')
          .attr('x1', nowline_start_x)
          .attr('y1', nowline_start_y)
          .attr('x2', nowline_end_x)
          .attr('y2', nowline_end_y)
          .attr('stroke', nowline_stroke)
          .attr('clip-path', 'url(#clip)');

        // add a y-axis line that shows the high bg threshold
        chart.focus.append('line')
          .attr('class', 'top-high-line')
          .attr('x1', tophighline_start_x)
          .attr('y1', tophighline_start_y)
          .attr('x2', tophighline_end_x)
          .attr('y2', tophighline_end_y)
          .style('stroke-dasharray', line_dashing)
          .attr('stroke', line_stroke);

        // add a y-axis line that shows the high bg threshold
        chart.focus.append('line')
          .attr('class', 'high-line')
          .attr('x1', highline_start_x)
          .attr('y1', highline_start_y)
          .attr('x2', highline_end_x)
          .attr('y2', highline_end_y)
          .style('stroke-dasharray', line_dashing)
          .attr('stroke', line_stroke);

        // add a y-axis line that shows the high bg threshold
        chart.focus.append('line')
          .attr('class', 'target-top-line')
          .attr('x1', targettopline_start_x)
          .attr('y1', targettopline_start_y)
          .attr('x2', targettopline_end_x)
          .attr('y2', targettopline_end_y)
          .style('stroke-dasharray', line_dashing)
          .attr('stroke', line_stroke);

        chart.focus.append('line')
          .attr('class', 'middle-line')
          .attr('x1', middleline_start_x)
          .attr('y1', middleline_start_y)
          .attr('x2', middleline_end_x)
          .attr('y2', middleline_end_y)
          .style('stroke-dasharray', line_dashing)
          .attr('stroke', line_stroke);

        // add a y-axis line that shows the low bg threshold
        chart.focus.append('line')
          .attr('class', 'target-bottom-line')
          .attr('x1', targetbottomline_start_x)
          .attr('y1', targetbottomline_start_y)
          .attr('x2', targetbottomline_end_x)
          .attr('y2', targetbottomline_end_y)
          .style('stroke-dasharray', line_dashing)
          .attr('stroke', line_stroke);

        // add a y-axis line that shows the low bg threshold
        chart.focus.append('line')
          .attr('class', 'low-line')
          .attr('x1', lowline_start_x)
          .attr('y1', lowline_start_y)
          .attr('x2', lowline_end_x)
          .attr('y2', lowline_end_y)
          .style('stroke-dasharray', line_dashing)
          .attr('stroke', line_stroke);

        chart.focus.append('line')
          .attr('class', 'bottom-low-line')
          .attr('x1', bottomlowline_start_x)
          .attr('y1', bottomlowline_start_y)
          .attr('x2', bottomlowline_end_x)
          .attr('y2', bottomlowline_end_y)
          .style('stroke-dasharray', line_dashing)
          .attr('stroke', line_stroke);

        chart.focus.append('line')
          .attr('class', 'open-top-back')
          .attr('stroke', '#c0c0c0')
          .attr('stroke-width', 6);

        // add a y-axis line that opens up the brush extent from the context to the focus
        chart.focus.append('line')
          .attr('class', 'open-top')
          .attr('stroke', '#88888d')
          .attr('stroke-width', 6);

        var extentAfter = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        extentAfter.setAttribute('class', 'extent-after');
        extentAfter.setAttribute('x', '0');
        extentAfter.setAttribute('width', '0');
        extentAfter.setAttribute('y', '0');
        extentAfter.setAttribute('height', '0');
        extentAfter.setAttribute('style', 'cursor: move;');
        var extent = document.querySelector('.extent');
        if(extent.parentElement){
          extent.parentElement.appendChild(extentAfter);
        }else{
          extent.parentNode.appendChild(extentAfter);
        }

        // add a x-axis line that closes the the brush container on left side
        chart.focus.append('line')
          .attr('class', 'open-left')
          .attr('stroke', 'white');

        // add a x-axis line that closes the the brush container on right side
        chart.focus.append('line')
          .attr('class', 'open-right')
          .attr('stroke', 'white');

        // add a y-axis line that shows the high bg threshold
        chart.context.append('line')
          .attr('class', 'high-line')
          .attr('x1', 0)
          .attr('y1', chart.yScale2(utils.scaleMgdl(client.settings.thresholds.bgTargetTop)))
          .attr('x2', Settings.page.width())
          .attr('y2', chart.yScale2(utils.scaleMgdl(client.settings.thresholds.bgTargetTop)))
          .style('stroke-dasharray', ('1, 3'))
          .attr('stroke', '#97979d');

        // add a y-axis line that shows the low bg threshold
        chart.context.append('line')
          .attr('class', 'low-line')
          .attr('x1', chart.xScale(dataRange[0]))
          .attr('y1', chart.yScale2(utils.scaleMgdl(client.settings.thresholds.bgTargetBottom)))
          .attr('x2', chart.xScale(dataRange[1]))
          .attr('y2', chart.yScale2(utils.scaleMgdl(client.settings.thresholds.bgTargetBottom)))
          .style('stroke-dasharray', ('3, 3'))
          .attr('stroke', 'grey');

      } else {

        // for subsequent updates use a transition to animate the axis to the new position
        var focusTransition = chart.focus.transition();

        // add a background
        chart.focus.select('.white-background')
          .attr('x', background_x)
          .attr('y', background_y)
          .attr('width', background_width)
          .attr('height', background_height);

        // add a blue overlay
        chart.focus.select('.blue-overlay')
          .attr('x', blueoverlay_x)
          .attr('y', blueoverlay_y)
          .attr('width', blueoverlay_width)
          .attr('height', blueoverlay_height);

        // add a grey overlay
        chart.focus.select('.grey-overlay')
          .attr('x', greyoverlay_x)
          .attr('y', greyoverlay_y)
          .attr('width', greyoverlay_width)
          .attr('height', greyoverlay_height);

        // add a dark grey overlay
        chart.focus.select('.darkgrey-overlay')
          .attr('x', darkgreyoverlay_x)
          .attr('y', darkgreyoverlay_y)
          .attr('width', darkgreyoverlay_width)
          .attr('height', darkgreyoverlay_height);

        chart.focus.select('.bottom-low-line')
          .attr('x1', bottomlowline_start_x)
          .attr('y1', bottomlowline_start_y)
          .attr('x2', bottomlowline_end_x)
          .attr('y2', bottomlowline_end_y);

        chart.focus.select('.middle-line')
          .attr('x1', middleline_start_x)
          .attr('y1', middleline_start_y)
          .attr('x2', middleline_end_x)
          .attr('y2', middleline_end_y);

        chart.focus.select('.top-high-line')
          .attr('x1', tophighline_start_x)
          .attr('y1', tophighline_start_y)
          .attr('x2', tophighline_end_x)
          .attr('y2', tophighline_end_y);

        chart.focus.select('.now-line')
          .attr('x1', nowline_start_x)
          .attr('y1', nowline_start_y)
          .attr('x2', nowline_end_x)
          .attr('y2', nowline_end_y);

        focusTransition.select('.x')
          .attr('transform', 'translate(0,' + focusHeight + ')')
          .call(chart.xAxis);

        focusTransition.select('.y')
          .attr('transform', 'translate(' + Settings.topChart.left + ', 0)')
          .call(chart.yAxis);

        focusTransition.select('.y3')
          .attr('transform', 'translate(' + (Settings.topChart.width() + Settings.topChart.right) + ', 0)')
          .call(chart.yAxis3);

        var contextTransition = chart.context.transition();

        contextTransition.select('.x')
          .attr('transform', 'translate(0,' + chartHeight + ')')
          .call(chart.xAxis2);

        if (chart.clip) {
          // reset clip to new dimensions
          chart.clip.transition()
            .attr('width', Settings.topChart.width())
            .attr('height', chartHeight);
        }

        // reset brush location
        chart.context.select('.x.brush')
          .selectAll('rect')
          .attr('y', focusHeight)
          .attr('height', chartHeight - focusHeight);

        // clear current brushs
        d3.select('.brush').call(chart.brush.clear());

        // redraw old brush with new dimensions
        d3.select('.brush').transition().call(chart.brush.extent(currentBrushExtent));

        // transition lines to correct location
        chart.focus.select('.high-line')
          .transition()
          .attr('x1', highline_start_x)
          .attr('y1', highline_start_y)
          .attr('x2', highline_end_x)
          .attr('y2', highline_end_y);

        chart.focus.select('.target-top-line')
          .transition()
          .attr('x1', targettopline_start_x)
          .attr('y1', targettopline_start_y)
          .attr('x2', targettopline_end_x)
          .attr('y2', targettopline_end_y);

        chart.focus.select('.target-bottom-line')
          .transition()
          .attr('x1', targetbottomline_start_x)
          .attr('y1', targetbottomline_start_y)
          .attr('x2', targetbottomline_end_x)
          .attr('y2', targetbottomline_end_y);

        chart.focus.select('.low-line')
          .transition()
          .attr('x1', lowline_start_x)
          .attr('y1', lowline_start_y)
          .attr('x2', lowline_end_x)
          .attr('y2', lowline_end_y);

        // transition open-top line to correct location
        chart.focus.select('.open-top')
          .transition()
          .attr('x1', chart.xScale2(currentBrushExtent[0]))
          .attr('y1', chart.yScale(utils.scaleMgdl(30)))
          .attr('x2', chart.xScale2(currentBrushExtent[1]))
          .attr('y2', chart.yScale(utils.scaleMgdl(30)));

        chart.focus.select('.open-top-back')
          .transition()
          .attr('x1', 0)
          .attr('y1', chart.yScale(utils.scaleMgdl(30)))
          .attr('x2', Settings.page.width())
          .attr('y2', chart.yScale(utils.scaleMgdl(30)));

        // transition open-left line to correct location
        chart.focus.select('.open-left')
          .transition()
          .attr('x1', chart.xScale2(currentBrushExtent[0]))
          .attr('y1', focusHeight)
          .attr('x2', chart.xScale2(currentBrushExtent[0]))
          .attr('y2', chartHeight);

        // transition open-right line to correct location
        chart.focus.select('.open-right')
          .transition()
          .attr('x1', chart.xScale2(currentBrushExtent[1]))
          .attr('y1', focusHeight)
          .attr('x2', chart.xScale2(currentBrushExtent[1]))
          .attr('y2', chartHeight);
      }
    }

    // update domain
    chart.xScale2.domain(dataRange);

    var updateBrush = d3.select('.brush').transition();
    updateBrush
      .call(chart.brush.extent([new Date(dataRange[1].getTime() - client.foucusRangeMS), dataRange[1]]));
    client.brushed(true);

    renderer.addContextCircles();

    // update x axis domain
    chart.context.select('.x').call(chart.xAxis2);

  }, DEBOUNCE_MS);

  chart.scroll = function scroll (nowDate) {
    chart.xScale.domain(createAdjustedRange());

    // remove all insulin/carb treatment bubbles so that they can be redrawn to correct location
    d3.selectAll('.path').remove();

    // transition open-top line to correct location
    chart.focus.select('.open-top')
      .attr('x1', chart.xScale2(chart.brush.extent()[0]))
      .attr('y1', chart.yScale(utils.scaleMgdl(30)) - 17)
      .attr('x2', chart.xScale2(new Date(chart.brush.extent()[1].getTime() + client.forecastTime)))
      .attr('y2', chart.yScale(utils.scaleMgdl(30)) - 17);

    chart.focus.select('.open-top-back')
      .attr('x1', 0)
      .attr('y1', chart.yScale(utils.scaleMgdl(30)) - 17)
      .attr('x2', Settings.page.width())
      .attr('y2', chart.yScale(utils.scaleMgdl(30)) - 17);

    var extent = $('rect.extent');
    var extentWidth = parseFloat(extent.attr('width'));
    var extentHeight = parseFloat(extent.attr('height'));
    var diff = parseFloat(chart.focus.select('.open-top').attr('x2')) - parseFloat(chart.focus.select('.open-top').attr('x1')) - extentWidth;

    var extentAfter = $('rect.extent-after');
    extentAfter
      .attr('x', parseFloat(extent.attr('x')) + parseFloat(extent.attr('width')))
      .attr('width', diff < 50 ? diff : 0)
      .attr('y', extent.attr('y'))
      .attr('height', extentHeight);

    // transition open-left line to correct location
    chart.focus.select('.open-left')
      .attr('x1', chart.xScale2(chart.brush.extent()[0]))
      .attr('y1', chart.focusHeight)
      .attr('x2', chart.xScale2(chart.brush.extent()[0]))
      .attr('y2', chart.prevChartHeight);

    // transition open-right line to correct location
    chart.focus.select('.open-right')
      .attr('x1', chart.xScale2(new Date(chart.brush.extent()[1].getTime() + client.forecastTime)))
      .attr('y1', chart.focusHeight)
      .attr('x2', chart.xScale2(new Date(chart.brush.extent()[1].getTime() + client.forecastTime)))
      .attr('y2', chart.prevChartHeight);

    chart.focus.select('.now-line')
      .transition()
      .attr('x1', chart.xScale(nowDate))
      .attr('x2', chart.xScale(nowDate))

    chart.focus.select('.blue-overlay')
      .transition()
      .attr('width', chart.xScale(nowDate) - line_start_x);

    chart.focus.select('.grey-overlay')
      .transition()
      .attr('x', chart.xScale(nowDate))
      .attr('width', (Settings.topChart.width()+Settings.topChart.left)-chart.xScale(nowDate));

    chart.focus.select('.darkgrey-overlay')
      .transition()
      .attr('x', chart.xScale(nowDate))
      .attr('width', (Settings.topChart.width()+Settings.topChart.left)-chart.xScale(nowDate));

    /*chart.context.select('.now-line')
      .transition()
      .attr('x1', chart.xScale2(chart.brush.extent()[1]))
      .attr('y1', chart.yScale2(utils.scaleMgdl(36)))
      .attr('x2', chart.xScale2(chart.brush.extent()[1]))
      .attr('y2', chart.yScale2(utils.scaleMgdl(420)));*/

    // update x axis
    chart.focus.select('.x.axis').call(chart.xAxis);

    renderer.addFocusCircles();
    renderer.addTreatmentCircles();

    // add treatment bubbles
    chart.focus.selectAll('circle')
      .data(client.treatments)
      .each(function (d) {
        renderer.drawTreatment(d, {
          scale: renderer.bubbleScale()
          , showLabels: true
        });
      });

  };

  return chart;
}

module.exports = init;
