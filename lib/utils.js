exports.selectRandomArrayItem = function(array){
    return array[Math.floor(Math.random() * array.length)];
};

exports.max = function (value) {
    return Math.max.apply(Math, value.map(function (o) {return o.bid;}));
};

// adjusts setTimeout time so it's in sync with actual time intervals
// e.g. 5 minutes intervals will happen at 10:05/10:10/10:15 regardless of start time
// TODO: add the ability to set the interval in seconds / minutes / hours
exports.make_interval = function (interval) {
    var d = new Date(), min = d.getMinutes(), sec = d.getSeconds();
    return min % interval === 0 && sec === 0 ? 0 : ((60 * (interval - (min % interval))) - sec) * 1000;
};
