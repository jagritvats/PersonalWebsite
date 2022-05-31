
const roleElement = document.getElementById("role-text");

const roles = ["Web Developer", "Cloud Enthusiast", "Coder", "Cyber Sec Enthusiast"]
var roleIndex = 0, textLength = roles[roleIndex].length;

var removeInterval, addInterval;

function removeText(){
    roleElement.innerText = roles[roleIndex].substring(0,textLength-1);
    textLength--;
    if(textLength==0){
        clearInterval(removeInterval);
        roleIndex = (roleIndex + 1) % roles.length;
        textLength = 0;
        addInterval = setInterval(addText, 200);
    }
}

function addText(){
    roleElement.innerText = roles[roleIndex].substring(0, textLength+1); // adding space in innerText didn't increase it's length in HTML
    textLength++;
    if(textLength == roles[roleIndex].length){
        clearInterval(addInterval);
        textLength = roles[roleIndex].length;
        setTimeout(()=>{
            removeInterval = setInterval(removeText, 200);
        },500); // pause for a while after text is completed
        
    }
}

function init(){
    roleElement.innerText = roles[roleIndex];
    setTimeout(()=>{
        removeInterval = setInterval(removeText, 200);
    }, 500);

    var imgs = document.getElementsByTagName("img");
    imgs = [...imgs];
    imgs.forEach(img => {
        img.ondragstart = () => {
            return false;
        };
    });

    // manually set skill images?
}

init();

