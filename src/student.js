class Student {
    constructor(id) {
        this.id = id;

        this.isStudying = true;
        this.seenRecentlyAtTime = Date.now();

        this.totalTime = 0;
        this.balance = 0;
    }
}

module.exports = { Student };