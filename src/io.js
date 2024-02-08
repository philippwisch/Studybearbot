const fs = require('fs');

const SAVE_FILE_NAME = 'data.json'

function save(data) {
    try {
        const jsonData = JSON.stringify(data);
        fs.writeFile(SAVE_FILE_NAME, jsonData, (error) => {
            if (error) {
                console.error('Error from writeFile callback: ', error.message);
            }
        });
    } catch (error) {
        console.error('Error saving data: ', error.message);
    }
}

function load() {
    try {
        const jsonData = fs.readFileSync(SAVE_FILE_NAME, 'utf-8');
        const data = JSON.parse(jsonData);
        return data;
    } catch (error) {
        console.error('Error loading data: ', error.message);
    }
}

module.exports = { save, load };