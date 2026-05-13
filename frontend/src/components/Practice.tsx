

interface Value {
    a: number;
    b: string;
}



function add(a: number, b: string):Value{
    return {
        a: a,
        b: b
};
}

console.log(add(2,'3'))


const add = (a: number, b:string): Value => {
    return{
        a: a,
        b: b
    }
}

console.log(add(2,'3'))