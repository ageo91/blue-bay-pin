// Blue Bay Pin: course and hole data.
// To add a hole: export its artwork to assets/holes/hole-N.jpg, generate assets/masks/hole-N.js
// with tools/build_mask.py, then add an entry below and a TIPS entry for Steffen.
window.BB_DATA={};

// Holes. w/h: artwork size in px. mw/mh: mask grid size (artwork / 4). tee/pin: px in artwork.
// m: metres per px. k: physics scale so a full shot carries ~175 m. drop: penalty drop zone or null.
window.BB_DATA.holes=[
  {num:1,par:4,w:1670,h:942,mw:417,mh:235,tee:{x:140,y:786},pin:{x:1452,y:258},m:0.265,k:1.19,bg:'#018EBD',drop:null,
   src:"assets/holes/hole-1.jpg"},
  {num:2,par:5,w:1568,h:1003,mw:392,mh:250,tee:{x:140,y:838},pin:{x:1381,y:224},m:0.337,k:0.94,bg:'#239463',drop:null,
   src:"assets/holes/hole-2.jpg"},
  {num:3,par:3,w:1535,h:1024,mw:383,mh:256,tee:{x:225,y:795},pin:{x:1191,y:366},m:0.126,k:2.51,bg:'#249569',drop:null,
   src:"assets/holes/hole-3.jpg"},
  {num:4,par:4,w:1672,h:941,mw:418,mh:235,tee:{x:125,y:815},pin:{x:1473,y:258},m:0.247,k:1.28,bg:'#1E956B',drop:null,
   src:"assets/holes/hole-4.jpg"},
  {num:6,par:3,w:1470,h:1070,mw:367,mh:267,tee:{x:168,y:752},pin:{x:1217,y:303},m:0.139,k:2.25,bg:'#048AB4',drop:{x:1300,y:215},
   src:"assets/holes/hole-6.jpg"},
  {num:7,par:4,w:1568,h:1003,mw:392,mh:251,tee:{x:158.5,y:855},pin:{x:1386,y:226},m:0.24,k:1.32,bg:'#187F4C',drop:null,
   src:"assets/holes/hole-7.jpg"}
];

// Course map: marker position per hole (px in assets/course-map.jpg), scorecard [par, yards], handicap, Steffen tips.
window.BB_DATA.marks={1:[778,570],2:[710,464],3:[696,343],4:[468,413],5:[251,540],6:[205,623],7:[192,515],8:[588,303],9:[882,324],10:[953,326],11:[1034,216],12:[1243,280],13:[1094,435],14:[1089,515],15:[1135,750],16:[1041,998],17:[959,930],18:[864,538]};
window.BB_DATA.card={1:[4,410],2:[5,510],3:[3,145],4:[4,395],5:[4,320],6:[3,180],7:[4,385],8:[5,530],9:[4,395],10:[4,365],11:[4,340],12:[3,160],13:[4,330],14:[4,340],15:[5,490],16:[4,365],17:[3,140],18:[5,490]};
window.BB_DATA.hcp={1:11,2:13,3:17,4:7,5:15,6:9,7:3,8:5,9:1,10:8,11:6,12:14,13:18,14:10,15:12,16:4,17:16,18:2};
window.BB_DATA.tips={
 1:["Hole 1, a friendly par 4 to get you started.","There's a body of water along the left, and the sandy edge beside it plays like one big bunker. Aim down the right half of the fairway.","Don't drift too far right, though. The trees there will cost you a stroke. Two solid shots and you're on the green."],
 4:["Hole 4, a par 4 and handicap 7. This one asks for a good drive.","Two bunkers sit on the left of the landing zone and a big one on the right, so the gap between them is narrow. Thread it down the middle.","Bunkers surround the green on every side. Use the extra fairway room to set up a short, straight approach."],
 6:["Welcome to our signature hole. Par 3, and the one everyone talks about.","You have to carry the gorge of crashing waves. Come up short and the sea keeps your ball.","Watch the wind arrow before you swing. Against you? Add power. If you find the water, you'll play from the drop zone right of the green.","Feeling nervous? The fairway on the right is the safe way around, but it'll cost you a shot."],
 2:["Hole 2, a par 5. Long, but fairly forgiving with handicap 13.","Bunkers wait on both sides of the fairway where your drive lands, so pick your line off the tee.","Plan three shots: a solid drive, a lay-up short of the big bunker on the right, then a soft approach. Small bunkers ring the green, so be precise."],
 3:["Hole 3, a short par 3 and one of the friendlier holes out here.","Three bunkers guard the green: one on the left, one at the back right, and one short on the right. Aim for the middle of the green.","Trees line both sides and the cart path runs along the left. A smooth, controlled swing beats a big one here."],
 7:["Hole 7, handicap 3. One of the toughest holes on the course.","Trees line both sides all the way, so accuracy beats power here.","Bunkers guard the fairway and the green. Stay short of them off the tee and leave yourself a clean approach."]
};
