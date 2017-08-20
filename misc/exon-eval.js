/*******************************
 * Command line option parsing *
 *******************************/

var getopt = function(args, ostr) {
	var oli; // option letter list index
	if (typeof(getopt.place) == 'undefined')
		getopt.ind = 0, getopt.arg = null, getopt.place = -1;
	if (getopt.place == -1) { // update scanning pointer
		if (getopt.ind >= args.length || args[getopt.ind].charAt(getopt.place = 0) != '-') {
			getopt.place = -1;
			return null;
		}
		if (getopt.place + 1 < args[getopt.ind].length && args[getopt.ind].charAt(++getopt.place) == '-') { // found "--"
			++getopt.ind;
			getopt.place = -1;
			return null;
		}
	}
	var optopt = args[getopt.ind].charAt(getopt.place++); // character checked for validity
	if (optopt == ':' || (oli = ostr.indexOf(optopt)) < 0) {
		if (optopt == '-') return null; //  if the user didn't specify '-' as an option, assume it means null.
		if (getopt.place < 0) ++getopt.ind;
		return '?';
	}
	if (oli+1 >= ostr.length || ostr.charAt(++oli) != ':') { // don't need argument
		getopt.arg = null;
		if (getopt.place < 0 || getopt.place >= args[getopt.ind].length) ++getopt.ind, getopt.place = -1;
	} else { // need an argument
		if (getopt.place >= 0 && getopt.place < args[getopt.ind].length)
			getopt.arg = args[getopt.ind].substr(getopt.place);
		else if (args.length <= ++getopt.ind) { // no arg
			getopt.place = -1;
			if (ostr.length > 0 && ostr.charAt(0) == ':') return ':';
			return '?';
		} else getopt.arg = args[getopt.ind]; // white space
		getopt.place = -1;
		++getopt.ind;
	}
	return optopt;
}

/***********************
 * Interval operations *
 ***********************/

Interval = {};

Interval.sort = function(a)
{
	if (typeof a[0] == 'number')
		a.sort(function(x, y) { return x - y });
	else a.sort(function(x, y) { return x[0] != y[0]? x[0] - y[0] : x[1] - y[1] });
}

Interval.merge = function(a, sorted)
{
	if (typeof sorted == 'undefined') sorted = true;
	if (!sorted) Interval.sort(a);
	var k = 0;
	for (var i = 1; i < a.length; ++i) {
		if (a[k][1] >= a[i][0])
			a[k][1] = a[k][1] > a[i][1]? a[k][1] : a[i][1];
		else a[++k] = a[i].slice(0);
	}
	a.length = k + 1;
}

Interval.index_end = function(a, sorted)
{
	if (a.length == 0) return;
	if (typeof sorted == 'undefined') sorted = true;
	if (!sorted) Interval.sort(a);
	a[0].push(0);
	var k = 0, k_en = a[0][1];
	for (var i = 1; i < a.length; ++i) {
		if (k_en <= a[i][0]) {
			for (++k; k < i; ++k)
				if (a[k][1] > a[i][0])
					break;
			k_en = a[k][1];
		}
		a[i].push(k);
	}
}

Interval.find_intv = function(a, x)
{
	var left = -1, right = a.length;
	if (typeof a[0] == 'number') {
		while (right - left > 1) {
			var mid = left + ((right - left) >> 1);
			if (a[mid] > x) right = mid;
			else if (a[mid] < x) left = mid;
			else return mid;
		}
	} else {
		while (right - left > 1) {
			var mid = left + ((right - left) >> 1);
			if (a[mid][0] > x) right = mid;
			else if (a[mid][0] < x) left = mid;
			else return mid;
		}
	}
	return left;
}

Interval.find_ovlp = function(a, st, en)
{
	if (a.length == 0 || st >= en) return [];
	var l = Interval.find_intv(a, st);
	var k = l < 0? 0 : a[l][a[l].length - 1];
	var b = [];
	for (var i = k; i < a.length; ++i) {
		if (a[i][0] >= en) break;
		else if (st < a[i][1])
			b.push(a[i]);
	}
	return b;
}

/*****************
 * Main function *
 *****************/

var c, l_fuzzy = 0, min_ov_ratio = 0.95, min_span_ratio = 0.9, print_ovlp = false, print_err_only = false, first_only = false;
while ((c = getopt(arguments, "l:r:s:ep1")) != null) {
	if (c == 'l') l_fuzzy = parseInt(getopt.arg);
	else if (c == 'r') min_ov_ratio = parseFloat(getopt.arg);
	else if (c == 's') min_span_ratio = parseFloat(getopt.arg);
	else if (c == 'p') print_ovlp = true;
	else if (c == 'e') print_err_only = print_ovlp = true;
	else if (c == '1') first_only = true;
}

if (arguments.length - getopt.ind < 2) {
	print("Usage: k8 cdna-eval.js [options] <gene.gtf> <aln.sam>");
	exit(1);
}

var file, buf = new Bytes();

var anno = {};
file = new File(arguments[getopt.ind]);
while (file.readline(buf) >= 0) {
	var m, t = buf.toString().split("\t");
	if (t[0].charAt(0) == '#') continue;
	if (t[2] != 'exon') continue;
	var st = parseInt(t[3]) - 1;
	var en = parseInt(t[4]);
	if (anno[t[0]] == null) anno[t[0]] = [];
	anno[t[0]].push([st, en]);
}
file.close();

for (var chr in anno) {
	var e = anno[chr];
	Interval.sort(e);
	var k = 0;
	for (var i = 1; i < e.length; ++i) // dedup
		if (e[i][0] != e[k][0] || e[i][1] != e[k][1])
			e[++k] = e[i].slice(0);
	e.length = k + 1;
	Interval.index_end(e);
}

var n_novel = 0, n_int_novel = 0, n_ext_novel = 0, n_sgl_novel = 0, n_partial = 0, n_unmapped = 0, n_mapped = 0, n_exon = 0, n_int_exon = 0, n_pri = 0, n_sgl_exon = 0, n_ext_exon = 0;
var n_ext_hit = 0, n_int_hit = 0, n_sgl_hit = 0;

file = new File(arguments[getopt.ind+1]);
var last_qname = null;
var re_cigar = /(\d+)([MIDNSHX=])/g;
while (file.readline(buf) >= 0) {
	var m, t = buf.toString().split("\t");
	if (t[0].charAt(0) == '@') continue;
	var flag = parseInt(t[1]);
	if (flag&0x100) continue;
	if (first_only && last_qname == t[0]) continue;
	if (t[2] == '*') {
		++n_unmapped;
		continue;
	} else {
		++n_pri;
		if (last_qname != t[0]) ++n_mapped;
	}
	var st = parseInt(t[3]) - 1, en = st, exon_st = st;
	var exon = [];
	while ((m = re_cigar.exec(t[5])) != null) {
		var len = parseInt(m[1]), op = m[2];
		if (op == 'N') {
			exon.push([exon_st, en]);
			en += len;
			exon_st = en;
		} else if (op == 'M' || op == 'X' || op == '=' || op == 'D') en += len;
	}
	exon.push([exon_st, en]);
	n_exon += exon.length;
	n_int_exon += exon.length > 2? exon.length - 2 : 0;
	n_sgl_exon += exon.length == 1? 1 : 0;
	n_ext_exon += exon.length > 1? 2 : 0;
	var chr = anno[t[2]];
	if (chr == null) {
		n_novel += exon.length;
		n_int_novel += exon.length > 2? exon.length - 2 : 0;
		n_sgl_novel += exon.length == 1? 1 : 0;
		n_ext_novel += exon.length > 1? 2 : 0;
	} else {
		for (var i = 0; i < exon.length; ++i) {
			var o = Interval.find_ovlp(chr, exon[i][0], exon[i][1]);
			if (o.length > 0) {
				var hit = false;
				for (var j = 0; j < o.length; ++j) {
					var min_st = exon[i][0] < o[j][0]? exon[i][0] : o[j][0];
					var max_st = exon[i][0] > o[j][0]? exon[i][0] : o[j][0];
					var min_en = exon[i][1] < o[j][1]? exon[i][1] : o[j][1];
					var max_en = exon[i][1] > o[j][1]? exon[i][1] : o[j][1];
					var ol = min_en - max_st, span = max_en - min_st;
					var l0 = exon[i][1] - exon[i][0];
					var l1 = o[j][1] - o[j][0];
					var min = l0 < l1? l0 : l1;
					var ov_ratio = ol / min;
					var st_diff = exon[i][0] - o[j][0];
					var en_diff = exon[i][1] - o[j][1];
					if (st_diff < 0) st_diff = -st_diff;
					if (en_diff < 0) en_diff = -en_diff;
					if (i == 0 && exon.length == 1) {
						if (ov_ratio >= min_ov_ratio) ++n_sgl_hit, hit = true;
					} else if (i == 0) {
						if (ov_ratio >= min_ov_ratio && en_diff <= l_fuzzy) ++n_ext_hit, hit = true;
					} else if (i == exon.length - 1) {
						if (ov_ratio >= min_ov_ratio && st_diff <= l_fuzzy) ++n_ext_hit, hit = true;
					} else {
						if (en_diff + st_diff <= l_fuzzy && ol / span >= min_span_ratio)
							++n_int_hit, hit = true;
					}
					if (hit) break;
				}
				if (print_ovlp) {
					var type = hit? 'C' : 'P';
					if (hit && print_err_only) continue;
					var x = '[';
					for (var j = 0; j < o.length; ++j) {
						if (j) x += ', ';
						x += '(' + o[j][0] + "," + o[j][1] + ')';
					}
					x += ']';
					print(type, t[0], i+1, t[2], exon[i][0], exon[i][1], x);
				}
			} else {
				++n_novel;
				if (i > 0 && i < exon.length - 1) ++n_int_novel;
				if (exon.length > 1 && (i == 0 || i == exon.length - 1)) ++n_ext_novel;
				if (exon.length == 1) ++n_sgl_novel;
				if (print_ovlp)
					print('N', t[0], i+1, t[2], exon[i][0], exon[i][1]);
			}
		}
	}
	last_qname = t[0];
}
file.close();

buf.destroy();

if (!print_ovlp) {
	print("Number of unmapped reads: " + n_unmapped);
	print("Number of mapped reads: " + n_mapped);
	print("Number of primary alignments: " + n_pri);
	print("Number of mapped exons: " + n_exon);
	print("Number of novel exons: " + n_novel);
	print("Number of correct exons: " + (n_ext_hit + n_int_hit + n_sgl_hit) + " (" + ((n_ext_hit + n_int_hit + n_sgl_hit) / n_exon * 100).toFixed(2) + "%)");
	print("Internal exons: " + n_int_novel + ", " + n_int_hit + " / " + n_int_exon + " = " + (n_int_hit / n_int_exon * 100).toFixed(2) + "%");
	print("External exons: " + n_ext_novel + ", " + n_ext_hit + " / " + n_ext_exon + " = " + (n_ext_hit / n_ext_exon * 100).toFixed(2) + "%");
	print("Singleton exons: " + n_sgl_novel + ", " + n_sgl_hit + " / " + n_sgl_exon + " = " + (n_sgl_hit / n_sgl_exon * 100).toFixed(2) + "%");
}
