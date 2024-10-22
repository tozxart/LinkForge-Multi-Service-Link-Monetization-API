function btoa(str) {
  var buffer;

  if (str instanceof Buffer) {
    buffer = str;
  } else {
    buffer = Buffer.from(str.toString(), "binary");
  }
  return buffer.toString("base64");
}

module.exports = (userid, link) => {
  var base_url = `https://link-to.net/${userid}/${
    Math.random() * 1000
  }/dynamic`;
  var href = base_url + "?r=" + btoa(encodeURI(link));
  return href;
};
