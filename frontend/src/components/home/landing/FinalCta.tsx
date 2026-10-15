import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

const FinalCta: React.FC = () => (
  <section className="bg-gray-900 py-14 sm:py-16" aria-labelledby="final-cta-title">
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="max-w-xl">
          <h2 id="final-cta-title" className="text-2xl font-semibold text-white">
            Ready to simplify your school’s administration?
          </h2>
          <p className="mt-2 text-sm sm:text-base text-gray-300">
            See how Nuventa Cloud can organise your school’s daily work and academic records. The demo is free and there is no obligation.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            to="/book-demo"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg"
          >
            Book a free demo
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
          <Link
            to="/contact"
            className="inline-flex items-center justify-center px-6 py-3 text-sm font-semibold text-gray-200 hover:text-white border border-gray-600 hover:border-gray-400 rounded-lg"
          >
            Contact our team
          </Link>
        </div>
      </div>
    </div>
  </section>
);

export default FinalCta;
