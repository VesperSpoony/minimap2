#include <stdlib.h>
#include "mmpriv.h"

void mm_select_sub_multi(void *km, float pri_ratio, float pri1, float pri2, int max_gap_ref, int min_diff, int best_n, int n_segs, const int *qlens, int *n_, mm_reg1_t *r)
{
	if (pri_ratio > 0.0f && *n_ > 0) {
		int i, k, n = *n_, n_2nd = 0;
		int max_dist = n_segs == 2? qlens[0] + qlens[1] + max_gap_ref : 0;
		for (i = k = 0; i < n; ++i) {
			int to_keep = 0;
			if (r[i].parent == i) { // primary
				to_keep = 1;
			} else if (r[i].score + min_diff >= r[r[i].parent].score) {
				to_keep = 1;
			} else {
				mm_reg1_t *p = &r[r[i].parent], *q = &r[i];
				if (p->rev == q->rev && p->rid == q->rid && q->re - p->rs < max_dist && p->re - q->rs < max_dist) { // child and parent are close on the ref
					if (q->score >= p->score * pri1)
						to_keep = 1;
				} else {
					int is_par_both = (n_segs == 2 && p->qs < qlens[0] && p->qe > qlens[0]);
					int is_chi_both = (n_segs == 2 && q->qs < qlens[0] && q->qe > qlens[0]);
					if (is_chi_both || is_chi_both == is_par_both) {
						if (q->score >= p->score * pri_ratio)
							to_keep = 1;
					} else { // the remaining case: is_chi_both == 0 && is_par_both == 1
						if (q->score >= p->score * pri2)
							to_keep = 1;
					}
				}
			}
			if (to_keep && r[i].parent != i) {
				if (n_2nd++ >= best_n) to_keep = 0; // don't keep if there are too many secondary hits
			}
			if (to_keep) r[k++] = r[i];
			else if (r[i].p) free(r[i].p);
		}
		if (k != n) mm_sync_regs(km, k, r); // removing hits requires sync()
		*n_ = k;
	}
}

