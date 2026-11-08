import React, { useState } from 'react';
import { ParkingLot, Review } from '../types';
import { Star, ThumbsUp, CheckCircle2, MessageSquarePlus, User, Sparkles, Filter, Send, Info } from 'lucide-react';

interface Props {
  lot: ParkingLot;
}

export const ReviewSection: React.FC<Props> = ({ lot }) => {
  const [reviews, setReviews] = useState<Review[]>(lot.reviews || []);
  const [filterRating, setFilterRating] = useState<number | 'all'>('all');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [newRating, setNewRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [userName, setUserName] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [comment, setComment] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const hasReviews = lot.reviews !== undefined && lot.reviews.length > 0;

  if (!hasReviews) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
          <Info className="w-4 h-4 text-slate-400 shrink-0" />
          <span>No reviews available for this parking facility.</span>
        </div>
      </div>
    );
  }

  const handleHelpfulClick = (reviewId: string) => {
    setReviews((prev) =>
      prev.map((r) =>
        r.id === reviewId ? { ...r, helpfulCount: (r.helpfulCount || 0) + 1 } : r
      )
    );
  };

  const handleSubmitReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;

    const createdReview: Review = {
      id: `rev-${Date.now()}`,
      userName: userName.trim() || 'Verified Driver',
      rating: newRating,
      date: 'Just now',
      vehicleType: vehicleType || 'Standard Vehicle',
      comment: comment.trim(),
      helpfulCount: 0,
      isVerifiedBooking: true,
    };

    setReviews([createdReview, ...reviews]);
    setIsSubmitted(true);
    setTimeout(() => {
      setIsSubmitted(false);
      setIsFormOpen(false);
      setComment('');
      setUserName('');
      setVehicleType('');
    }, 1500);
  };

  const filteredReviews = reviews.filter((r) =>
    filterRating === 'all' ? true : r.rating === filterRating
  );

  const totalCount = reviews.length;
  const avgRating = (
    reviews.reduce((acc, r) => acc + r.rating, 0) / (totalCount || 1)
  ).toFixed(1);

  const getPercentageForStars = (stars: number) => {
    const count = reviews.filter((r) => r.rating === stars).length;
    return Math.round((count / (totalCount || 1)) * 100);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-5">

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-extrabold text-slate-900">Driver Reviews & Ratings</h3>
            <span className="bg-emerald-50 text-emerald-700 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Verified Bookings
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Authentic feedback from drivers who parked at {lot.name}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsFormOpen(!isFormOpen)}
          className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <MessageSquarePlus className="w-4 h-4" />
          <span>{isFormOpen ? 'Cancel Feedback' : 'Write a Review'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">

        <div className="md:col-span-4 flex flex-col items-center justify-center text-center border-b md:border-b-0 md:border-r border-slate-200 pb-3 md:pb-0 md:pr-4">
          <span className="text-4xl font-black text-slate-900 tracking-tight">{avgRating}</span>
          <div className="flex items-center gap-1 my-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`w-4 h-4 ${star <= Math.round(Number(avgRating))
                  ? 'fill-amber-400 text-amber-400'
                  : 'text-slate-300 fill-slate-100'
                  }`}
              />
            ))}
          </div>
          <span className="text-xs text-slate-500 font-semibold">{totalCount} verified reviews</span>
        </div>

        <div className="md:col-span-8 space-y-1.5 flex flex-col justify-center">
          {[5, 4, 3, 2, 1].map((stars) => {
            const pct = getPercentageForStars(stars);
            return (
              <div key={stars} className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <span className="w-6 text-right font-bold text-slate-700">{stars}</span>
                <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-10 text-right text-[11px] text-slate-500">{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {isFormOpen && (
        <form
          onSubmit={handleSubmitReview}
          className="bg-blue-50/60 border border-blue-200 p-4 rounded-2xl space-y-3.5 animate-fade-in"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-blue-600" /> Share Your Experience
            </h4>
            <span className="text-[10px] text-slate-500 font-medium">After your booking ends</span>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 block">Your Star Rating</label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setNewRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-1 text-amber-400 hover:scale-110 transition-transform cursor-pointer"
                >
                  <Star
                    className={`w-6 h-6 ${star <= (hoverRating || newRating)
                      ? 'fill-amber-400 text-amber-400'
                      : 'text-slate-300'
                      }`}
                  />
                </button>
              ))}
              <span className="ml-2 text-xs font-bold text-slate-700">
                {hoverRating || newRating} / 5 Stars
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Your Name</label>
              <input
                type="text"
                placeholder="e.g., Sarah M."
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Vehicle Type / Model</label>
              <input
                type="text"
                placeholder="Enter vehicle type or model"
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Review Details</label>
            <textarea
              rows={3}
              required
              placeholder="How was the gate access, lighting, stall width, or charging experience?"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            {isSubmitted ? (
              <span className="text-xs font-extrabold text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Feedback submitted successfully!
              </span>
            ) : (
              <span className="text-[11px] text-slate-500">Reviews help fellow drivers find safe spots</span>
            )}

            <button
              type="submit"
              disabled={isSubmitted || !comment.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-extrabold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer ml-auto"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Submit Feedback</span>
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <span className="text-xs font-bold text-slate-500 flex items-center gap-1 mr-1">
              <Filter className="w-3.5 h-3.5" /> Filter:
            </span>
            {(['all', 5, 4, 3] as const).map((starVal) => (
              <button
                key={String(starVal)}
                onClick={() => setFilterRating(starVal)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${filterRating === starVal
                  ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                  : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                  }`}
              >
                {starVal === 'all' ? 'All Reviews' : `${starVal} Stars`}
              </button>
            ))}
          </div>

          <span className="text-xs text-slate-400 font-medium shrink-0">
            Showing {filteredReviews.length} reviews
          </span>
        </div>

        <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-200">
          {filteredReviews.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-xs font-medium bg-slate-50 rounded-2xl">
              {reviews.length === 0 ? 'No reviews have been submitted yet.' : 'No reviews match this star filter yet.'}
            </div>
          ) : (
            filteredReviews.map((rev) => (
              <div
                key={rev.id}
                className="bg-slate-50/80 border border-slate-200/80 p-3.5 rounded-2xl space-y-2 hover:border-slate-300 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-extrabold text-xs flex items-center justify-center border border-blue-200">
                      {rev.userName.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-extrabold text-slate-900">{rev.userName}</span>
                        {rev.isVerifiedBooking && (
                          <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                            Verified
                          </span>
                        )}
                      </div>
                      {rev.vehicleType && (
                        <span className="text-[10px] text-slate-500 font-medium block">
                          Parked with {rev.vehicleType}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`w-3.5 h-3.5 ${s <= rev.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                            }`}
                        />
                      ))}
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium">{rev.date}</span>
                  </div>
                </div>

                <p className="text-xs text-slate-700 font-medium leading-relaxed pl-0.5">
                  "{rev.comment}"
                </p>

                <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                  <span className="text-[10px] text-slate-400">Did you find this helpful?</span>
                  <button
                    type="button"
                    onClick={() => handleHelpfulClick(rev.id)}
                    className="text-[11px] font-bold text-slate-600 hover:text-blue-600 flex items-center gap-1 cursor-pointer hover:bg-slate-200/60 px-2 py-0.5 rounded-lg transition-colors"
                  >
                    <ThumbsUp className="w-3 h-3" />
                    <span>Helpful ({rev.helpfulCount || 0})</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
