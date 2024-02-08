// formats input time in seconds to dd:hh:mm
function timeFormat(seconds) {
    function pad(number) {
        return number < 10 ? `0${number}` : `${number}`;
    }
    const days = pad(Math.floor(seconds / (3600 * 24)));
    const hours = pad(Math.floor((seconds % (3600 * 24)) / 3600));
    const minutes = pad(Math.floor((seconds % 3600) / 60));

    const formattedTime = `${days}d ${hours}h ${minutes}m`;
    return formattedTime;
}

// drastically enhances a string
function uwufiy(string) {
    const suffixes = ['Rawr', ':3', 'uwu', 'OWO', 'B A K A', 'nyaaa~', 'ʕ·͡ᴥ·ʔ', 'ツ', '^^', '₍ᐢ. .ᐢ₎', 'ฅ^•ﻌ•^ฅ', '꒰˶ᵔ ᵕ ᵔ˶꒱']
    const i = Math.floor(Math.random() * suffixes.length);
    if (typeof string === 'string') { string += ' ' + suffixes[i] }
    return string;
}

module.exports = { timeFormat, uwufiy }