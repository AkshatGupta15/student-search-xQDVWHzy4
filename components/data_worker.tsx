// import students from "@/pages/api/data.json";
import {Student, Query, Options} from  "./commontypes";

var students: any[] = []

var config = {
    "APP_ID": "data-yubip",
    "API_KEY": "XvhvZNBWObiDyf651zDE8LsSx59zssBKVMlTHSftn566l7rXoVrbQxnW0L2p6L5A",
    "cluster_name": "Cluster0",
    "db_name": "student_data",
    "collection_name": "student_data"
}

console.log("Worker instantiated");

//setting up the values for the fields in the Options component
const options: Options = {
	batch:[],
	hall:[],
	prog:[],
	dept:[],
	bloodgrp:[]
};

var db: any | undefined = ""; //holds the reference to the IndexedDB storing student data locally

// interface Options {//type declaration
// 	 batch: Array<string>;
// 	 hall: Array<string>;
// 	 prog: Array<string>;
// 	 dept: Array<string>;
// 	 bloodgrp: Array<string>
// }

// interface Student {
// 	a: string; //address
// 	b: string; //blood group
// 	d: string; //department
// 	g: string; //gender
// 	h: string; //hall of residence
// 	i: string; //roll number
// 	n: string; //full name
// 	p: string; //programme
// 	r: string; //room number
// 	u: string; //username
// 	s: string; //roll number of baapu/amma
// 	c: Array<string> | string; //array containing roll numbers of bacchas (or the words "not available")
// }

// interface Query {
// 	gender: string;
// 	name: string;
// 	batch: Array<string>;
// 	hall: Array<string>;
// 	prog: Array<string>;
// 	dept: Array<string>;
// 	bloodgrp: Array<string>;
// 	address: string;
// }

// interface Query {
// 	gender: string;
// 	name: string;
// 	batch: Array<string>;
// 	hall: Array<string>;
// 	prog: Array<string>;
// 	dept: Array<string>;
// 	bloodgrp: Array<string>;
// 	address: string;
// }

async function fetch_student_data() { //WILL throw errors when something goes wrong - this is intentional
	const access_token = (await fetch(`https://ap-south-1.aws.realm.mongodb.com/api/client/v2.0/app/${config.APP_ID}/auth/providers/api-key/login`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			"key": config.API_KEY //read-only key
		})
    }).then(res => res.json()).catch(err => {
    	console.error("Could not fetch access token");
    	throw err;
    })).access_token;
    console.log(`Access token:`);
    console.log(access_token);
    if (access_token === undefined) {throw new Error("Access token undefined");}
    const student_data = (await fetch(`https://ap-south-1.aws.data.mongodb-api.com/app/${config.APP_ID}/endpoint/data/v1/action/find`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${access_token}`,
        },
        body: JSON.stringify({
            dataSource: config.cluster_name,
            database: config.db_name,
            collection: config.collection_name,
            filter: {},
            limit: 30000
        })
	}).then(res => res.json())).documents;
	console.log("Testing method")
	console.log(student_data);
	if (!Array.isArray(student_data)) {throw new Error("Student data undefined")}
 	return student_data;
}


async function start_IDB() { //if this resolves, the global variable 'db' should contain a reference to the database - otherwise it should remain an empty string
	return new Promise((resolve, reject) => {
		db = "";
		const openRequest = indexedDB.open("students", 1);
		openRequest.addEventListener("error", (error) => {
			console.error("Failed to access local database.");
			console.log(error);
			reject("Failed to access local database.");
		}, {once: true});
		openRequest.addEventListener("success", () => {
			console.log("Successfully opened IDB");
			db = openRequest.result;
			resolve("Success");
		}, {once: true});
		openRequest.addEventListener("upgradeneeded", (event) => {
			//set up the DB, and if nothing goes wrong (i.e. no errors) then resolve successfully
			console.log("Setting up IDB");
			db = event.target?.result;
			const objStore = db.createObjectStore("students", {keyPath:"id", autoIncrement:true});
			objStore.createIndex("students", "students", {unique: false}) //this will hold the array/json string of the response
			console.log("Finished setting up IDB");
			//should trigger success event handler now, so we don't resolve the promise here
		}, {once: true});
	})
}

//both of these assume that 'db' has the reference to the IndexedDB after 'start_IDB()' finishes - otherwise, will throw errors
async function update_IDB() {
	await start_IDB();
	//first: we get a cursor to see if there is already a record - if so, we delete it
	//then, we store "students" into the DB
	//this should all happen in one transaction so that if trxn fails, we don't end up with an empty DB or two items
	let trxn = db.transaction(["students"], "readwrite");
	console.log("Opened transaction");
	trxn.objectStore("students").openCursor().onsuccess = (event) => {
		let cursor = event.target?.result;
		if (cursor) {
			console.log("Deleting an entry");
			trxn.objectStore("students").delete(cursor.value.id)
			cursor.continue()
		} else {
			//no more entries left - so now we add the data from the global variable "students"
			console.log("All entries deleted");
			console.log("Adding students to DB");
			console.log(students);
			trxn.objectStore("students").add({"students": students, "key":1});
			
		}
	}
	trxn.oncomplete = () => {
		console.log("Student data successfully saved locally.");
	}
	trxn.onerror = (error) => {
		console.error("Something went wrong when trying to update the local database.");
		console.error(error);
	}
}

async function check_IDB() {
	return new Promise(async (resolve, reject) => {
		await start_IDB();
		//just get a cursor and see if the record is there - if yes, put it into the global variable "students" - if not, throw an error
		let trxn = db.transaction(["students"],"readwrite")
		trxn.objectStore("students").openCursor().onsuccess = (event) => {
			let cursor = event.target?.result;
			if (cursor) {//if there is an entry
				console.log("Found the students data locally");
				resolve(cursor.value.students);
	// 			console.log("Dumping value of students to console");
	// 			console.log(cursor.value.students);
			} else {
				throw new Error("IDB is empty.");
			}
		}
		trxn.onerror = (error) => {
			console.error("Error occurred when trying to access IDB.");
			throw error;
		}
		//no need for an oncomplete handler
	})
}


function prepare_worker() {//student data should be in a global variable called "students", and there should be a global variable "options" to take the list of options for everything
//after filling the "options" variable, send "Worker ready" message and set up onmessage handler

	console.log("prepare_worker() logging students:");
	console.log(students)
	
	let st: Student;
	for (st of students) {
		let key: keyof Options;
		for (key in options) {
			if (key === "batch") {
				if (!(options.batch.includes(rollToYear(st.i)))) options.batch.push(rollToYear(st.i));
			} else {
				let key0: "h"|"p"|"d"|"b" = key[0] as "h"|"p"|"d"|"b";
				if (!options[key].includes(st[key0])) options[key].push(st[key0])
			}
		}
	}

	let key: keyof Options;
	for (key in options) {
		options[key].sort();	
	}
	onmessage = function (event) {
	// 	console.log("Received a message.");
	// 	console.log(event);
	// 	console.log(event.data);
		if (event.data === "ready?") postMessage("Worker ready");
		else if (event.data === "Options") {
	// 		console.log("Providing option headers");
	// 		console.log(options);
			postMessage(["Options", options]);
		} else if (Array.isArray(event.data)) {// data style: ["ft", student (an object as seen above)]
			console.log("Family tree");
			let student = event.data[1];
			let baapu = students.filter((st: Student) => (st.i === student.s))[0]; //note that this can also be undefined - this will be handled by TreeCard
			let bacchas = check_bacchas(student.c);
			postMessage(["ft", [baapu, student, bacchas]]);
	
		} else {
			//query stuff - should post list of satisfying students
	// 		console.log("Normal list of students");
			console.log(event.data);
			console.log(check_query(event.data));
			postMessage(["query", check_query(event.data)]);
		
		}
	}
	console.log("Worker ready");
	postMessage("Worker ready");
}

//actually do everything
(async function () {
	try {
		students = await fetch_student_data();
		update_IDB();
	} catch (error) {
		console.error(error)
		try {
			console.log("Checking if student data is locally available...")
			students = await check_IDB(); //if there is an error here, everything should fail because nothing can be done
		} catch (error) {
			console.error("Something went wrong when checking for data locally.");
			postMessage("Error"); //so that app knows something has gone wrong and can show an error message
			throw error; //fail evarythang
		}
		
	}
	prepare_worker();
})(); //execute immediately (not yet)






// fetch_student_data()
// 	.then(res => {
// 	console.log("Response data:")
// 	console.log(res);
// 	students = res;
// 	// update_IDB();
// // 	check_IDB();
// 	console.log(students)
// 	
// 	let st: Student;
// 	for (st of students) {
// 		let key: keyof Options;
// 		for (key in options) {
// 			if (key === "batch") {
// 				if (!(options.batch.includes(rollToYear(st.i)))) options.batch.push(rollToYear(st.i));
// 			} else {
// 				let key0: "h"|"p"|"d"|"b" = key[0] as "h"|"p"|"d"|"b";
// 				if (!options[key].includes(st[key0])) options[key].push(st[key0])
// 			}
// 		}
// 	}
// 
// 	let key: keyof Options;
// 	for (key in options) {
// 		options[key].sort();	
// 	}
// 	//done with the values for the fields in the Options component
// 
// 	console.log("Worker ready");
// 	postMessage("Worker ready");
// 
// 	onmessage = function (event) {
// 	// 	console.log("Received a message.");
// 	// 	console.log(event);
// 	// 	console.log(event.data);
// 		if (event.data === "ready?") postMessage("Worker ready");
// 		else if (event.data === "Options") {
// 	// 		console.log("Providing option headers");
// 	// 		console.log(options);
// 			postMessage(["Options", options]);
// 		} else if (Array.isArray(event.data)) {// data style: ["ft", student (an object as seen above)]
// 			console.log("Family tree");
// 			let student = event.data[1];
// 			let baapu = students.filter((st: Student) => (st.i === student.s))[0]; //note that this can also be undefined - this will be handled by TreeCard
// 			let bacchas = check_bacchas(student.c);
// 			postMessage(["ft", [baapu, student, bacchas]]);
// 	
// 		} else {
// 			//query stuff - should post list of satisfying students
// 	// 		console.log("Normal list of students");
// 			console.log(event.data);
// 			console.log(check_query(event.data));
// 			postMessage(["query", check_query(event.data)]);
// 		
// 		}
// 	}
// }).catch(error => {
// 	console.log("Something went wrong.")
// 	console.log(error);
// 	postMessage("Error");
// })

// fetch_student_data();





type Query0 = "g"|"n"|"h"|"p"|"d"|"b"|"a";

function rollToYear(roll: string): string {
	//take a student's roll number, and output the batch they were in.
	if ((roll[0] === "Y") && (roll[1]) > "7") {
		return roll.slice(0,2);
	} else if (roll.slice(0,2) < '30') {
		return "Y" + roll.slice(0,2);
	} else return "Other";
}

function check_bacchas(bacchas: "Not Available" | Array<string>) : Array<Student> {
	if (bacchas === "Not Available") {
		return [];
	} else {
		return students.filter((student) => (bacchas.includes(student.i)));
		
	}
}

function check_query(query: Query) : Array<Student> {
	//goes through the array of students and selects only those that match the query given.

	return students.filter((student: Student) => {
		let key: keyof Query;
		let entry = false;
		for (key in query) {
			// the idea here is that if a student DOESN'T satisfy a certain part of the query, we immediately discard them using "return false"
			// at the end, we have a "return true" - so any records that make it to the end of the "gauntlet" are added to the final list.
			if (query[key].length == 0) { //skip any fields that don't have anything in them
				continue
			}
			entry = true; //if query is not totally empty, entry is set to true
			if (key === "name") {
				// special processing for the "name" field
				// we can't match the name to the student's username or roll number right now because it could still match their real name - so we can't just immediately put "return false" if it doesn't match, and we can't just put "return true" if it does match because the student may not match the criteria in other fields.
				// so, we have to check this at the end.
				// so, we check if the name matches the student's full name first.
				
				let partsOfQueryName = query.name.toLowerCase().split(/\s+/);
				let lastPartOfQN: string = partsOfQueryName.pop()!;
				let partsOfStudentName = student.n.toLowerCase().split(/\s+/)
				let test1 = true;
				
				// each part of the name in the query must match to exactly one part of the name of the student, and vice versa
				// so, we go through each part in partsOfQueryName, and we go through each part in partsOfStudentName - if they match, we remove that part in partsOfStudentName, and we move on
				// if a part in partsOfQueryName DOESN't match any part of the student's name, we leave the for loop, and go on to check if the name in the query matches the student's username or roll number
				
				for (const queryPart of partsOfQueryName) {
					let test2 = false;
					for (const studentPart of partsOfStudentName) {
						if (studentPart === queryPart) {
							let index = partsOfStudentName.indexOf(studentPart);
							partsOfStudentName.splice(index,1);
							test2 = true; //found a match for this part, so let's exit the loop so we can move onto the next part
							break;
						}
					}
					if (!test2) {//if we went through the all partsOfStudentName without finding a match, stop checking for these parts and move straight to checking username/roll number.
						test1 = false;
						break;
					}
				}
				
				if (test1) {
					// if test1 is not yet false, this means that all other parts of the name entered have matched with a part in the student's name.
					// all that's left is to check the final part of the student name - which can be incomplete, so we use startsWith instead of equals.
					let test2 = false;
					for (const part of partsOfStudentName) {
						if (part.startsWith(lastPartOfQN)) {
							test2 = true;
							break;
						}
					}
					if (!test2) {
						test1 = false;
					}
				}
				
				//now that we've checked the name completely, we just need to check if the queried name matches the username/roll number if it hasn't matched the name.
				if (!test1) {
					let lowercased_name = query.name.toLowerCase();
					if (!(student.i.includes(lowercased_name)) && !(student.u.startsWith(lowercased_name))) return false;
				} //if the name doesn't match EITHER, then we discard that student's record.
			} else if (key === "batch") {
				// special processing for the "batch"/"year" field
				if (!(query.batch.includes(rollToYear(student.i)))) return false;
			} else if (key === "gender") {
				let student_data = student[key[0] as "g"].toLowerCase();
				let query_data = query[key].toLowerCase();
				if (!(student_data === query_data)) return false;
			}else if (key === "address") {
				if (!(student.a.toLowerCase().includes(query.address.toLowerCase()))) return false;
			} else { //all the other stuff
				let key0 : Query0 = key[0] as Query0;
				if (!(query[key].includes(student[key0]))) return false; //note that this allows query[key] to be an array - so, if e.g. query is just {i:[1, 2, 3]} it will return the students with roll numbers 1, 2 and 3 - this helps with finding bacchas
				// note that because typescript is such a stickler for everything, the above trick is no longer possible without making changes. >:/
			}
		}
		return entry; //if query is totally empty, this will be false - otherwise it will be true
	});
}